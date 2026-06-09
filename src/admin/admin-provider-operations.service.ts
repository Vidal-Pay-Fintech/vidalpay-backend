import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ProviderOperationStatus,
  ProviderWebhookEventStatus,
} from 'src/common/enum/provider-operation.enum';
import { ProviderOperation } from 'src/database/entities/provider-operation.entity';
import { ProviderWebhookEvent } from 'src/database/entities/provider-webhook-event.entity';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from 'src/database/repositories/provider-webhook-event.repository';

type AdminActionContext = {
  actorId: string | null;
  actorRole: string | null;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type ListFilters = {
  status?: string;
  provider?: string;
  take?: string;
  skip?: string;
};

@Injectable()
export class AdminProviderOperationsService {
  constructor(
    private readonly providerOperationRepository: ProviderOperationRepository,
    private readonly providerWebhookEventRepository: ProviderWebhookEventRepository,
  ) {}

  async listProviderOperations(filters: ListFilters) {
    return this.providerOperationRepository.find({
      where: this.compact({
        status: filters.status,
        provider: filters.provider,
      }) as any,
      order: { createdAt: 'DESC' } as any,
      take: this.parsePositiveInteger(filters.take, 50, 100),
      skip: this.parsePositiveInteger(filters.skip, 0, 10000),
    });
  }

  async getProviderOperation(id: string) {
    const operation = await this.providerOperationRepository.findOne({
      where: { id },
    });

    if (!operation) {
      throw new NotFoundException('Provider operation not found.');
    }

    return operation;
  }

  async requestRetry(id: string, context: AdminActionContext) {
    const operation = await this.getProviderOperation(id);
    const nextMetadata = this.appendAuditEntry(
      operation.metadata,
      'provider_operation.retry_requested',
      operation.id,
      context,
      {
        status: operation.status,
        reconciliationStatus: operation.reconciliationStatus,
      },
      {
        retryRequested: true,
        reconciliationStatus: 'RETRY_REQUESTED',
      },
    );

    return this.providerOperationRepository.findOneAndUpdate(operation.id, {
      reconciliationStatus: 'RETRY_REQUESTED',
      metadata: {
        ...nextMetadata,
        retryRequestedAt: new Date().toISOString(),
      },
    });
  }

  async requestReversal(id: string, context: AdminActionContext) {
    const operation = await this.getProviderOperation(id);
    const nextMetadata = this.appendAuditEntry(
      operation.metadata,
      'provider_operation.reversal_requested',
      operation.id,
      context,
      {
        status: operation.status,
        reconciliationStatus: operation.reconciliationStatus,
      },
      {
        reversalRequested: true,
        reconciliationStatus: 'REVERSAL_REQUESTED',
      },
    );

    return this.providerOperationRepository.findOneAndUpdate(operation.id, {
      reconciliationStatus: 'REVERSAL_REQUESTED',
      metadata: {
        ...nextMetadata,
        reversalRequestedAt: new Date().toISOString(),
        reversalExecution:
          'Manual provider/ledger reversal must be executed by a certified adapter or reconciliation worker.',
      },
    });
  }

  async markReviewed(id: string, context: AdminActionContext) {
    const operation = await this.getProviderOperation(id);
    const nextMetadata = this.appendAuditEntry(
      operation.metadata,
      'provider_operation.mark_reviewed',
      operation.id,
      context,
      {
        status: operation.status,
        reconciliationStatus: operation.reconciliationStatus,
      },
      {
        reconciliationStatus: 'REVIEWED',
      },
    );

    return this.providerOperationRepository.findOneAndUpdate(operation.id, {
      reconciliationStatus: 'REVIEWED',
      metadata: {
        ...nextMetadata,
        reviewedAt: new Date().toISOString(),
      },
    });
  }

  async listWebhookEvents(filters: ListFilters) {
    return this.providerWebhookEventRepository.find({
      where: this.compact({
        status: filters.status,
        provider: filters.provider,
      }) as any,
      order: { createdAt: 'DESC' } as any,
      take: this.parsePositiveInteger(filters.take, 50, 100),
      skip: this.parsePositiveInteger(filters.skip, 0, 10000),
    });
  }

  async getWebhookEvent(id: string) {
    const event = await this.providerWebhookEventRepository.findOne({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException('Provider webhook event not found.');
    }

    return event;
  }

  async requestWebhookReplay(id: string, context: AdminActionContext) {
    const event = await this.getWebhookEvent(id);
    const nextMetadata = this.appendAuditEntry(
      event.metadata,
      'provider_webhook_event.replay_requested',
      event.id,
      context,
      {
        status: event.status,
        retryCount: event.retryCount,
      },
      {
        status: ProviderWebhookEventStatus.RECEIVED,
        retryCount: event.retryCount + 1,
      },
    );

    return this.providerWebhookEventRepository.findOneAndUpdate(event.id, {
      status: ProviderWebhookEventStatus.RECEIVED,
      retryCount: event.retryCount + 1,
      processedAt: null,
      failureReason: null,
      metadata: {
        ...nextMetadata,
        replayRequestedAt: new Date().toISOString(),
        replayExecution:
          'Replay request recorded. Processing requires a reconciliation worker or provider-specific replay handler.',
      },
    });
  }

  async getReconciliationSummary() {
    const [operations, webhookEvents] = await Promise.all([
      this.providerOperationRepository.find({
        order: { createdAt: 'DESC' } as any,
        take: 1000,
      }),
      this.providerWebhookEventRepository.find({
        order: { createdAt: 'DESC' } as any,
        take: 1000,
      }),
    ]);

    return {
      operationCountsByStatus: this.countBy(operations, 'status'),
      operationCountsByReconciliationStatus: this.countBy(
        operations,
        'reconciliationStatus',
      ),
      webhookCountsByStatus: this.countBy(webhookEvents, 'status'),
      pendingOperations: operations.filter((operation) =>
        [
          ProviderOperationStatus.PENDING,
          ProviderOperationStatus.PROCESSING,
          ProviderOperationStatus.UNDER_REVIEW,
        ].includes(operation.status),
      ).length,
      failedOperations: operations.filter(
        (operation) => operation.status === ProviderOperationStatus.FAILED,
      ).length,
      unprocessedWebhookEvents: webhookEvents.filter((event) =>
        [
          ProviderWebhookEventStatus.RECEIVED,
          ProviderWebhookEventStatus.VERIFIED,
          ProviderWebhookEventStatus.FAILED,
          ProviderWebhookEventStatus.DEAD_LETTER,
        ].includes(event.status),
      ).length,
      sampleSize: {
        operations: operations.length,
        webhookEvents: webhookEvents.length,
      },
    };
  }

  async runReconciliation(context: AdminActionContext) {
    const summary = await this.getReconciliationSummary();

    return {
      ...summary,
      action: {
        requestedBy: context.actorId,
        requestedAt: new Date().toISOString(),
        reason: context.reason,
        status: 'RECONCILIATION_REVIEW_GENERATED',
        message:
          'No provider calls were executed. Provider-specific reconciliation workers must execute money movement or reversal actions.',
      },
    };
  }

  private appendAuditEntry<T extends Record<string, any> | null>(
    metadata: T,
    action: string,
    entityId: string,
    context: AdminActionContext,
    before: Record<string, any>,
    after: Record<string, any>,
  ) {
    const existingMetadata: Record<string, any> = metadata ?? {};
    const existingTrail = Array.isArray(existingMetadata.adminAuditTrail)
      ? existingMetadata.adminAuditTrail
      : [];

    return {
      ...existingMetadata,
      adminAuditTrail: [
        ...existingTrail,
        {
          actorId: context.actorId,
          actorRole: context.actorRole,
          action,
          entityType: action.startsWith('provider_webhook_event')
            ? 'ProviderWebhookEvent'
            : 'ProviderOperation',
          entityId,
          before,
          after,
          reason: context.reason,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private countBy<T extends Record<string, any>>(items: T[], key: keyof T) {
    return items.reduce<Record<string, number>>((acc, item) => {
      const value = String(item[key] ?? 'UNSET');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  }

  private parsePositiveInteger(
    value: string | undefined,
    fallback: number,
    max: number,
  ) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return fallback;
    }

    return Math.min(parsed, max);
  }

  private compact(input: Record<string, unknown>) {
    return Object.entries(input).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = value;
        }

        return acc;
      },
      {},
    );
  }
}
