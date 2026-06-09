import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderWebhookEventStatus,
} from 'src/common/enum/provider-operation.enum';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from 'src/database/repositories/provider-webhook-event.repository';
import { WEBHOOK_PROVIDER_MAP } from './webhook-provider-map';

const WEBHOOK_SECRET_ENV_BY_SLUG: Record<string, string> = {
  flutterwave: 'FLW_WEBHOOK_SECRET_HASH',
  smileid: 'SMILE_ID_WEBHOOK_SECRET',
  leadbank: 'LEAD_BANK_WEBHOOK_SECRET',
  verto: 'VERTO_WEBHOOK_SECRET',
  zerohash: 'ZERO_HASH_WEBHOOK_SECRET',
  cowrywise: 'COWRYWISE_WEBHOOK_SECRET',
  sardine: 'SARDINE_WEBHOOK_SECRET',
};

@Injectable()
export class WebhooksService {
  constructor(
    private readonly providerWebhookEventRepository: ProviderWebhookEventRepository,
    private readonly providerOperationRepository: ProviderOperationRepository,
  ) {}

  async handle(
    providerSlug: string,
    payload: Record<string, any>,
    headers?: Record<string, string | string[] | undefined>,
    rawBody?: Buffer | string,
  ) {
    const provider = this.resolveProvider(providerSlug);
    const eventReference = this.pickFirstString(
      payload.id,
      payload.event_id,
      payload.reference,
      payload.tx_ref,
      payload.data?.id,
      payload.data?.reference,
    );
    const operationReference = this.pickFirstString(
      payload.operationReference,
      payload.reference,
      payload.tx_ref,
      payload.data?.operationReference,
      payload.data?.tx_ref,
      payload.data?.reference,
    );
    const eventType =
      this.pickFirstString(payload.event, payload.type, payload.data?.event) ??
      `${providerSlug}.webhook`;
    const rawPayload = this.stringifyPayload(payload, rawBody);
    const rawPayloadHash = createHash('sha256')
      .update(rawPayload)
      .digest('hex');
    const signature = this.verifySignature(providerSlug, rawPayload, headers);
    const idempotencyKey =
      eventReference ?? `${providerSlug}_${eventType}_${rawPayloadHash}`;
    const operation = operationReference
      ? await this.providerOperationRepository.findByReference(
          operationReference,
        )
      : null;

    const { event, created } =
      await this.providerWebhookEventRepository.createIfAbsentByReference({
        provider,
        eventType,
        eventReference: idempotencyKey,
        operationReference,
        operationId: operation?.id ?? null,
        status: signature.signatureValid
          ? ProviderWebhookEventStatus.VERIFIED
          : ProviderWebhookEventStatus.FAILED,
        payload,
        signatureValid: signature.signatureValid,
        idempotencyKey,
        rawPayloadHash,
        metadata: {
          signatureVerification: signature.signatureValid
            ? 'VERIFIED'
            : 'FAILED',
          signatureHeader: signature.signatureHeader,
          providerSlug,
        },
        processedAt: null,
        receivedAt: new Date(),
        failureReason: signature.signatureValid
          ? null
          : signature.failureReason,
      });

    if (!created) {
      return {
        provider,
        eventType,
        duplicate: true,
        processed: event.status === ProviderWebhookEventStatus.PROCESSED,
        eventReference: idempotencyKey,
        operationReference,
      };
    }

    if (!signature.signatureValid) {
      return {
        provider,
        eventType,
        duplicate: false,
        processed: false,
        eventReference: idempotencyKey,
        operationReference,
        failureReason: signature.failureReason,
      };
    }

    const nextStatus = this.mapPayloadStatus(payload);
    if (operationReference) {
      if (operation) {
        await this.providerOperationRepository.findOneAndUpdate(operation.id, {
          status: nextStatus,
          responsePayload: {
            ...(operation.responsePayload ?? {}),
            lastWebhookPayload: payload,
            lastWebhookEventId: event.id,
          },
          metadata: {
            ...(operation.metadata ?? {}),
            lastWebhookProvider: provider,
            lastWebhookEventType: eventType,
            lastWebhookAt: new Date().toISOString(),
            lastWebhookEventId: event.id,
          },
          lastWebhookEventId: event.id,
          reconciledAt:
            nextStatus === ProviderOperationStatus.COMPLETED
              ? new Date()
              : operation.reconciledAt,
        });
      }
    }

    await this.providerWebhookEventRepository.findOneAndUpdate(event.id, {
      status: ProviderWebhookEventStatus.PROCESSED,
      processedAt: new Date(),
    });

    return {
      provider,
      eventType,
      duplicate: false,
      processed: true,
      eventReference: idempotencyKey,
      operationReference,
      operationStatus: nextStatus,
    };
  }

  private resolveProvider(slug: string): KycProvider {
    const provider = WEBHOOK_PROVIDER_MAP[slug];
    if (!provider) {
      throw new BadRequestException(`Unsupported webhook provider: ${slug}`);
    }

    return provider;
  }

  private mapPayloadStatus(payload: Record<string, any>) {
    const rawStatus = String(
      payload.status ?? payload.data?.status ?? payload.eventStatus ?? '',
    )
      .trim()
      .toUpperCase();

    if (
      ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'APPROVED'].includes(
        rawStatus,
      )
    ) {
      return ProviderOperationStatus.COMPLETED;
    }

    if (
      ['FAILED', 'FAILURE', 'DECLINED', 'REJECTED', 'ERROR'].includes(rawStatus)
    ) {
      return ProviderOperationStatus.FAILED;
    }

    if (['REVERSED', 'REFUNDED'].includes(rawStatus)) {
      return ProviderOperationStatus.REVERSED;
    }

    if (['UNDER_REVIEW', 'REVIEW', 'PENDING_REVIEW'].includes(rawStatus)) {
      return ProviderOperationStatus.UNDER_REVIEW;
    }

    return ProviderOperationStatus.PROCESSING;
  }

  private verifySignature(
    providerSlug: string,
    rawPayload: string,
    headers?: Record<string, string | string[] | undefined>,
  ) {
    const secretEnvKey = WEBHOOK_SECRET_ENV_BY_SLUG[providerSlug];
    const secret = secretEnvKey ? process.env[secretEnvKey] : null;
    const headerValue = this.pickHeader(headers, [
      'verif-hash',
      'x-signature',
      'x-webhook-signature',
      'x-sardine-signature',
    ]);

    if (!secretEnvKey || !secret) {
      return {
        signatureValid: false,
        signatureHeader: headerValue.header,
        failureReason: 'PROVIDER_WEBHOOK_SECRET_MISSING',
      };
    }

    if (!headerValue.value) {
      return {
        signatureValid: false,
        signatureHeader: headerValue.header,
        failureReason: 'WEBHOOK_SIGNATURE_MISSING',
      };
    }

    if (providerSlug === 'flutterwave') {
      return {
        signatureValid: this.safeCompare(headerValue.value, secret),
        signatureHeader: headerValue.header,
        failureReason: this.safeCompare(headerValue.value, secret)
          ? null
          : 'WEBHOOK_SIGNATURE_INVALID',
      };
    }

    const expected = createHmac('sha256', secret)
      .update(rawPayload)
      .digest('hex');
    const normalizedSignature = headerValue.value.replace(/^sha256=/i, '');

    return {
      signatureValid: this.safeCompare(normalizedSignature, expected),
      signatureHeader: headerValue.header,
      failureReason: this.safeCompare(normalizedSignature, expected)
        ? null
        : 'WEBHOOK_SIGNATURE_INVALID',
    };
  }

  private pickHeader(
    headers: Record<string, string | string[] | undefined> | undefined,
    names: string[],
  ) {
    if (!headers) {
      return { header: null, value: null };
    }

    const normalizedHeaders = Object.entries(headers).reduce<
      Record<string, string | string[] | undefined>
    >((acc, [key, value]) => {
      acc[key.toLowerCase()] = value;
      return acc;
    }, {});

    for (const name of names) {
      const value = normalizedHeaders[name.toLowerCase()];
      const firstValue = Array.isArray(value) ? value[0] : value;
      if (firstValue) {
        return {
          header: name,
          value: firstValue,
        };
      }
    }

    return { header: null, value: null };
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private stringifyPayload(
    payload: Record<string, any>,
    rawBody?: Buffer | string,
  ) {
    if (Buffer.isBuffer(rawBody)) {
      return rawBody.toString('utf8');
    }

    if (typeof rawBody === 'string' && rawBody.length > 0) {
      return rawBody;
    }

    return JSON.stringify(payload ?? {});
  }

  private pickFirstString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length) {
        return value.trim();
      }

      if (typeof value === 'number') {
        return String(value);
      }
    }

    return null;
  }
}
