import { BadRequestException, Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderWebhookEventStatus,
} from 'src/common/enum/provider-operation.enum';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from 'src/database/repositories/provider-webhook-event.repository';
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
    const signaturePresent = this.hasSignature(headers);

    const { event, created } =
      await this.providerWebhookEventRepository.createIfAbsentByReference({
        provider,
        eventType,
        eventReference,
        operationReference,
        status: ProviderWebhookEventStatus.RECEIVED,
        payload,
        metadata: {
          signatureVerification: signaturePresent ? 'PRESENT_PLACEHOLDER' : 'SKIPPED_DEMO_PLACEHOLDER',
          providerSlug,
        },
        processedAt: null,
      });

    if (!created) {
      return {
        provider,
        eventType,
        duplicate: true,
        processed: event.status === ProviderWebhookEventStatus.PROCESSED,
        eventReference,
        operationReference,
      };
    }

    const nextStatus = this.mapPayloadStatus(payload);
    if (operationReference) {
      const operation =
        await this.providerOperationRepository.findByReference(operationReference);
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
          },
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
      eventReference,
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

    if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'APPROVED'].includes(rawStatus)) {
      return ProviderOperationStatus.COMPLETED;
    }

    if (['FAILED', 'FAILURE', 'DECLINED', 'REJECTED', 'ERROR'].includes(rawStatus)) {
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

  private hasSignature(headers?: Record<string, string | string[] | undefined>) {
    if (!headers) {
      return false;
    }

    return Boolean(
      headers['x-signature'] ||
        headers['x-webhook-signature'] ||
        headers['verif-hash'] ||
        headers['x-sardine-signature'],
    );
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
