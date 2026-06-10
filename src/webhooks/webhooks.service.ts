import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderWebhookEventStatus,
} from 'src/common/enum/provider-operation.enum';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from 'src/database/repositories/provider-webhook-event.repository';
import { getLiveProviderAdapterBySlug } from 'src/integrations/provider/live/live-provider-adapters';
import { WEBHOOK_PROVIDER_MAP } from './webhook-provider-map';

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
    const resolvedProviderSlug = this.resolveProviderSlug(providerSlug);
    const provider = this.resolveProvider(resolvedProviderSlug);
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
      `${resolvedProviderSlug}.webhook`;
    const rawPayload = this.stringifyPayload(payload, rawBody);
    const rawPayloadHash = createHash('sha256')
      .update(rawPayload)
      .digest('hex');
    const signature = this.verifySignature(
      resolvedProviderSlug,
      rawPayload,
      headers,
    );
    const idempotencyKey =
      eventReference ??
      `${resolvedProviderSlug}_${eventType}_${rawPayloadHash}`;
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
          providerSlug: resolvedProviderSlug,
          requestedProviderSlug: providerSlug,
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

  private resolveProviderSlug(slug: string) {
    const normalized = slug.toLowerCase();
    if (normalized === 'tax') {
      const taxMode = String(process.env.TAX_PROVIDER_MODE ?? 'april')
        .trim()
        .toLowerCase();

      return taxMode === 'column' ? 'column' : 'april';
    }

    return normalized;
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
    const adapter = getLiveProviderAdapterBySlug(providerSlug);
    if (!adapter) {
      return {
        signatureValid: false,
        signatureHeader: null,
        failureReason: 'PROVIDER_ADAPTER_MISSING',
      };
    }

    const result = adapter.verifyWebhook(headers ?? {}, rawPayload);
    if (result instanceof Promise) {
      return {
        signatureValid: false,
        signatureHeader: null,
        failureReason: 'ASYNC_WEBHOOK_VERIFICATION_NOT_SUPPORTED',
      };
    }

    return {
      signatureValid: result.signatureValid,
      signatureHeader: result.signatureHeader ?? null,
      failureReason: result.failureReason ?? null,
    };
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
