import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Repository } from 'typeorm';
import { ProviderWebhookEvent } from '../entities/provider-webhook-event.entity';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { ProviderWebhookEventStatus } from 'src/common/enum/provider-operation.enum';
import { randomUUID } from 'crypto';

@Injectable()
export class ProviderWebhookEventRepository extends AbstractRepository<ProviderWebhookEvent> {
  protected readonly logger = new Logger(ProviderWebhookEventRepository.name);

  constructor(
    @InjectRepository(ProviderWebhookEvent)
    protected readonly providerWebhookEventEntityRepository: Repository<ProviderWebhookEvent>,
  ) {
    super(providerWebhookEventEntityRepository);
  }

  async findByProviderAndReference(
    provider: KycProvider,
    eventReference: string,
  ): Promise<ProviderWebhookEvent | null> {
    return this.findOne({
      where: {
        provider,
        eventReference,
      },
    });
  }

  async hasProcessedEvent(
    provider: KycProvider,
    eventReference: string,
  ): Promise<boolean> {
    const event = await this.findOne({
      where: {
        provider,
        eventReference,
        status: ProviderWebhookEventStatus.PROCESSED,
      },
    });

    return Boolean(event);
  }

  async createIfAbsentByReference(input: {
    provider: KycProvider;
    eventType: string;
    eventReference: string | null;
    operationReference: string | null;
    operationId?: string | null;
    status: ProviderWebhookEventStatus;
    payload: Record<string, any> | null;
    signatureValid?: boolean | null;
    idempotencyKey?: string | null;
    rawPayloadHash?: string | null;
    metadata: Record<string, any> | null;
    retryCount?: number;
    receivedAt?: Date | null;
    processedAt: Date | null;
    failureReason?: string | null;
  }): Promise<{ event: ProviderWebhookEvent; created: boolean }> {
    if (input.eventReference) {
      const existing = await this.findByProviderAndReference(
        input.provider,
        input.eventReference,
      );
      if (existing) {
        return { event: existing, created: false };
      }
    }

    const id = randomUUID();

    try {
      await this.providerWebhookEventEntityRepository.insert({
        id,
        provider: input.provider,
        eventType: input.eventType,
        eventReference: input.eventReference,
        operationReference: input.operationReference,
        operationId: input.operationId ?? null,
        status: input.status,
        payload: input.payload,
        signatureValid: input.signatureValid ?? null,
        idempotencyKey: input.idempotencyKey ?? input.eventReference,
        rawPayloadHash: input.rawPayloadHash ?? null,
        metadata: input.metadata,
        retryCount: input.retryCount ?? 0,
        receivedAt: input.receivedAt ?? new Date(),
        processedAt: input.processedAt,
        failureReason: input.failureReason ?? null,
      } as Partial<ProviderWebhookEvent>);
    } catch (error) {
      if (this.isDuplicateReferenceError(error)) {
        if (input.eventReference) {
          const duplicate = await this.findByProviderAndReference(
            input.provider,
            input.eventReference,
          );
          if (duplicate) {
            return { event: duplicate, created: false };
          }
        }
      }

      throw error;
    }

    const created = await this.findOne({
      where: {
        id,
      },
    });

    if (!created) {
      if (input.eventReference) {
        const duplicate = await this.findByProviderAndReference(
          input.provider,
          input.eventReference,
        );
        if (duplicate) {
          return { event: duplicate, created: false };
        }
      }

      throw new Error('Webhook event could not be persisted.');
    }

    return { event: created, created: true };
  }

  private isDuplicateReferenceError(error: unknown): boolean {
    const typedError = error as {
      code?: string;
      errno?: number;
      message?: string;
      driverError?: {
        code?: string;
        errno?: number;
        message?: string;
      };
    };

    return Boolean(
      typedError?.code === 'ER_DUP_ENTRY' ||
        typedError?.errno === 1062 ||
        typedError?.driverError?.code === 'ER_DUP_ENTRY' ||
        typedError?.driverError?.errno === 1062 ||
        typedError?.message?.includes('Duplicate entry') ||
        typedError?.driverError?.message?.includes('Duplicate entry'),
    );
  }
}
