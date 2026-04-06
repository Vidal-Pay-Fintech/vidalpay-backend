import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
  ProviderWebhookEventStatus,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Wallet } from 'src/database/entities/wallet.entity';
import { User } from 'src/database/entities/user.entity';
import { ProviderOperationRepository } from 'src/database/repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from 'src/database/repositories/provider-webhook-event.repository';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { JournalService } from 'src/journal/journal.service';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { TagType } from 'src/utils/enums/tag.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { ProviderRouterService } from './provider-router.service';
import {
  CardTopUpIntentPayload,
  ProviderProductPayload,
} from './interfaces/regional-provider.interface';

@Injectable()
export class ProviderOperationsService {
  private readonly logger = new Logger(ProviderOperationsService.name);

  constructor(
    private readonly providerRouter: ProviderRouterService,
    private readonly walletRepository: WalletRepository,
    private readonly providerOperationRepository: ProviderOperationRepository,
    private readonly providerWebhookEventRepository: ProviderWebhookEventRepository,
    private readonly journalService: JournalService,
  ) {}

  async ensureReceiveRailsForUser(
    user: User,
    region: SupportedRegion | null,
  ): Promise<Wallet[]> {
    const provider = this.providerRouter.getProviderByRegion(region);
    const wallets =
      user.wallet?.length
        ? user.wallet
        : await this.walletRepository.findUserWallets(user.id);

    if (!provider || !wallets.length) {
      return wallets;
    }

    const rails = await provider.provisionReceiveRails(user, wallets);
    for (const rail of rails) {
      const wallet = wallets.find((item) => item.id === rail.walletId);
      if (!wallet) {
        continue;
      }

      const railChanged =
        wallet.accountNumber !== rail.accountNumber ||
        wallet.routingNumber !== rail.routingNumber ||
        wallet.accountName !== rail.accountName ||
        wallet.bankName !== rail.bankName ||
        wallet.sortCode !== rail.sortCode ||
        wallet.providerReference !== rail.providerReference ||
        wallet.providerAccountId !== rail.providerAccountId ||
        wallet.providerCustomerId !== rail.providerCustomerId ||
        wallet.providerVirtualAccountId !== rail.providerVirtualAccountId;

      if (!railChanged) {
        continue;
      }

      await this.walletRepository.findOneAndUpdate(wallet.id, {
        accountNumber: rail.accountNumber ?? undefined,
        routingNumber: rail.routingNumber ?? undefined,
        accountName: rail.accountName ?? undefined,
        bankName: rail.bankName ?? undefined,
        sortCode: rail.sortCode ?? undefined,
        routingRegionCode: rail.region,
        routingProvider: rail.provider,
        providerCustomerId: rail.providerCustomerId ?? undefined,
        providerAccountId: rail.providerAccountId ?? undefined,
        providerVirtualAccountId: rail.providerVirtualAccountId ?? undefined,
        providerReference: rail.providerReference ?? undefined,
        providerMetadata: rail.providerMetadata ?? undefined,
      });

      const existingOperation = rail.providerReference
        ? await this.providerOperationRepository.findByReference(
            rail.providerReference,
          )
        : null;

      if (!existingOperation) {
        await this.providerOperationRepository.create({
          userId: user.id,
          walletId: wallet.id,
          provider: rail.provider,
          regionCode: rail.region,
          operationType: ProviderOperationType.RAIL_PROVISIONING,
          status: ProviderOperationStatus.COMPLETED,
          reference: rail.providerReference,
          currency: rail.currency,
          requestPayload: {
            walletId: wallet.id,
            currency: rail.currency,
          },
          responsePayload: rail.providerMetadata,
          reconciledAt: new Date(),
        });
      }
    }

    return this.walletRepository.findUserWallets(user.id);
  }

  async createExternalTransfer(input: {
    user: User;
    region: SupportedRegion;
    wallet: Wallet;
    amount: number;
    currency: Currency;
    destinationAccountNumber: string;
    destinationAccountName?: string | null;
    destinationBankName?: string | null;
    destinationRoutingNumber?: string | null;
    narration?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    const provider = this.providerRouter.getProviderByRegion(input.region);
    if (!provider) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    if (!provider.supportsOperation(ProviderOperationType.EXTERNAL_TRANSFER)) {
      throw new BadRequestException(API_MESSAGES.EXTERNAL_TRANSFER_UNAVAILABLE);
    }

    const execution = await provider.createExternalTransfer({
      user: input.user,
      wallet: input.wallet,
      amount: input.amount,
      currency: input.currency,
      destinationAccountNumber: input.destinationAccountNumber,
      destinationAccountName: input.destinationAccountName,
      destinationBankName: input.destinationBankName,
      destinationRoutingNumber: input.destinationRoutingNumber,
      narration: input.narration,
      metadata: input.metadata,
    });

    await this.providerOperationRepository.create({
      userId: input.user.id,
      walletId: input.wallet.id,
      provider: execution.provider,
      regionCode: input.region,
      operationType: execution.operationType,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
      currency: input.currency,
      amount: input.amount,
      requestPayload: {
        destinationAccountNumber: input.destinationAccountNumber,
        destinationAccountName: input.destinationAccountName ?? null,
        destinationBankName: input.destinationBankName ?? null,
        destinationRoutingNumber: input.destinationRoutingNumber ?? null,
        narration: input.narration ?? null,
      },
      responsePayload: execution.responsePayload ?? null,
      metadata: execution.metadata ?? input.metadata ?? null,
      reconciledAt:
        execution.status === ProviderOperationStatus.COMPLETED
          ? new Date()
          : null,
    });

    return {
      provider: execution.provider,
      region: input.region,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
    };
  }

  async createCardTopUpIntent(input: {
    user: User;
    region: SupportedRegion;
    wallet: Wallet;
    amount: number;
    currency: Currency;
    redirectUrl?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    const provider = this.providerRouter.getProviderByRegion(input.region);
    if (!provider) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    if (!provider.supportsOperation(ProviderOperationType.CARD_TOPUP)) {
      throw new BadRequestException(API_MESSAGES.CARD_TOPUP_UNAVAILABLE);
    }

    const execution = await provider.createCardTopUpIntent?.({
      user: input.user,
      wallet: input.wallet,
      amount: input.amount,
      currency: input.currency,
      redirectUrl: input.redirectUrl ?? null,
      metadata: input.metadata ?? null,
    } satisfies CardTopUpIntentPayload);

    if (!execution) {
      throw new BadRequestException(API_MESSAGES.CARD_TOPUP_UNAVAILABLE);
    }

    await this.providerOperationRepository.create({
      userId: input.user.id,
      walletId: input.wallet.id,
      provider: execution.provider,
      regionCode: input.region,
      operationType: execution.operationType,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
      currency: input.currency,
      amount: input.amount,
      requestPayload: {
        redirectUrl: input.redirectUrl ?? null,
      },
      responsePayload: execution.responsePayload ?? null,
      metadata: execution.metadata ?? input.metadata ?? null,
      reconciledAt:
        execution.status === ProviderOperationStatus.COMPLETED
          ? new Date()
          : null,
    });

    return {
      provider: execution.provider,
      region: input.region,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
      checkoutUrl: execution.checkoutUrl,
      redirectUrl: execution.redirectUrl,
      expiresAt: execution.expiresAt ?? null,
    };
  }

  async createRegionalProductOperation(input: {
    operationType:
      | ProviderOperationType.AIRTIME
      | ProviderOperationType.DATA
      | ProviderOperationType.UTILITY;
    user: User;
    region: SupportedRegion;
    payload: ProviderProductPayload;
  }) {
    const provider = this.providerRouter.getProviderByRegion(input.region);
    if (!provider) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    if (!provider.supportsOperation(input.operationType)) {
      throw new BadRequestException(API_MESSAGES.PRODUCT_NOT_AVAILABLE_FOR_REGION);
    }

    let execution;
    if (input.operationType === ProviderOperationType.AIRTIME) {
      execution = await provider.purchaseAirtime?.(input.payload);
    } else if (input.operationType === ProviderOperationType.DATA) {
      execution = await provider.purchaseData?.(input.payload);
    } else {
      execution = await provider.payUtility?.(input.payload);
    }

    if (!execution) {
      throw new BadRequestException(API_MESSAGES.PRODUCT_NOT_AVAILABLE_FOR_REGION);
    }

    await this.providerOperationRepository.create({
      userId: input.user.id,
      walletId: input.payload.wallet.id,
      provider: execution.provider,
      regionCode: input.region,
      operationType: execution.operationType,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
      currency: input.payload.currency,
      amount: input.payload.amount,
      requestPayload: {
        phoneNumber: input.payload.phoneNumber ?? null,
        serviceCode: input.payload.serviceCode ?? null,
        customerReference: input.payload.customerReference ?? null,
      },
      responsePayload: execution.responsePayload ?? null,
      metadata: execution.metadata ?? input.payload.metadata ?? null,
      reconciledAt:
        execution.status === ProviderOperationStatus.COMPLETED
          ? new Date()
          : null,
    });

    return {
      provider: execution.provider,
      region: input.region,
      status: execution.status,
      reference: execution.reference,
      externalReference: execution.externalReference ?? null,
    };
  }

  async handleWebhook(input: {
    provider: KycProvider;
    payload: Record<string, any>;
    headers?: Record<string, string | string[] | undefined>;
  }) {
    const providerAdapter = this.providerRouter.getProviderByName(input.provider);
    if (!providerAdapter) {
      throw new BadRequestException(API_MESSAGES.KYC_PROVIDER_UNAVAILABLE);
    }

    const execution = await providerAdapter.handleWebhook(
      input.payload,
      input.headers,
    );

    const initialWebhookStatus = execution.ignored
      ? ProviderWebhookEventStatus.IGNORED
      : ProviderWebhookEventStatus.RECEIVED;

    const { event: webhookEvent, created } =
      await this.providerWebhookEventRepository.createIfAbsentByReference({
        provider: execution.provider,
        eventType: execution.eventType,
        eventReference: execution.eventReference ?? null,
        operationReference: execution.operationReference ?? null,
        status: initialWebhookStatus,
        payload: input.payload,
        metadata: execution.metadata ?? null,
        processedAt: null,
      });

    if (!created) {
      return {
        provider: execution.provider,
        eventType: execution.eventType,
        processed: webhookEvent.status === ProviderWebhookEventStatus.PROCESSED,
        operationReference:
          execution.operationReference ?? execution.eventReference ?? null,
        duplicate: true,
      };
    }

    const operationReference =
      execution.operationReference ?? execution.eventReference ?? null;

    let webhookStatus: ProviderWebhookEventStatus = initialWebhookStatus;
    let failureReason: string | null = null;

    if (operationReference) {
      const operation =
        await this.providerOperationRepository.findByReference(operationReference);
      if (operation) {
        const nextStatus =
          execution.operationStatus ?? ProviderOperationStatus.PROCESSING;
        const operationMetadata = {
          ...(operation.metadata ?? {}),
          ...(execution.metadata ?? {}),
        };
        const reversalReference = await this.reconcileFailedOperationDebit(
          operation,
          nextStatus,
          operationMetadata,
        );

        if (reversalReference) {
          operationMetadata.walletDebitReversalReference = reversalReference;
          operationMetadata.walletReversedAt = new Date().toISOString();
        }

        await this.providerOperationRepository.findOneAndUpdate(operation.id, {
          status:
            reversalReference &&
            (nextStatus === ProviderOperationStatus.FAILED ||
              nextStatus === ProviderOperationStatus.REVERSED)
              ? ProviderOperationStatus.REVERSED
              : nextStatus,
          responsePayload: {
            ...(operation.responsePayload ?? {}),
            webhookEventId: webhookEvent.id,
            lastWebhookEventType: execution.eventType,
            lastWebhookPayload: input.payload,
          },
          metadata: operationMetadata,
          reconciledAt: execution.processed ? new Date() : operation.reconciledAt,
        });
      }
    }

    if (execution.processed && execution.metadata?.walletCredit) {
      try {
        const creditTransaction = await this.creditIncomingWalletDeposit(
          execution.metadata.walletCredit,
        );

        await this.providerWebhookEventRepository.findOneAndUpdate(webhookEvent.id, {
          metadata: {
            ...(execution.metadata ?? {}),
            walletCreditTransactionReference:
              creditTransaction?.reference ?? null,
            walletCreditTransactionId: creditTransaction?.id ?? null,
          },
        });
        webhookStatus = ProviderWebhookEventStatus.PROCESSED;
      } catch (error) {
        webhookStatus = ProviderWebhookEventStatus.FAILED;
        failureReason = error.message;
        this.logger.error(
          `Failed to credit wallet from webhook ${webhookEvent.id}: ${error.message}`,
          error.stack,
        );
      }
    } else if (execution.processed && !execution.ignored) {
      webhookStatus = ProviderWebhookEventStatus.PROCESSED;
    }

    await this.providerWebhookEventRepository.findOneAndUpdate(webhookEvent.id, {
      status: webhookStatus,
      processedAt:
        webhookStatus === ProviderWebhookEventStatus.PROCESSED
          ? new Date()
          : null,
      failureReason,
    });

    return {
      provider: execution.provider,
      eventType: execution.eventType,
      processed: webhookStatus === ProviderWebhookEventStatus.PROCESSED,
      operationReference,
    };
  }

  private async creditIncomingWalletDeposit(walletCredit: {
    userId: string;
    amount: number;
    currency: Currency;
    walletId?: string | null;
    reference?: string | null;
    info?: string | null;
    description?: string | null;
  }) {
    return this.journalService.processWalletCreditJournal({
      userId: walletCredit.userId,
      amount: Number(walletCredit.amount),
      currency: walletCredit.currency,
      info:
        walletCredit.info ??
        `Wallet funding received via provider reference ${walletCredit.reference ?? 'N/A'}`,
      description:
        walletCredit.description ??
        `Wallet funding from provider reference ${walletCredit.reference ?? 'N/A'}`,
      tag: TagType.WALLET,
    });
  }

  private async reconcileFailedOperationDebit(
    operation: {
      id: string;
      userId: string | null;
      amount: number | null;
      currency: Currency | null;
      operationType: ProviderOperationType;
      metadata: Record<string, any> | null;
      reference: string | null;
    },
    nextStatus: ProviderOperationStatus,
    metadata: Record<string, any>,
  ): Promise<string | null> {
    if (
      nextStatus !== ProviderOperationStatus.FAILED &&
      nextStatus !== ProviderOperationStatus.REVERSED
    ) {
      return null;
    }

    if (metadata.walletDebitReversalReference) {
      return String(metadata.walletDebitReversalReference);
    }

    if (!operation.userId || !operation.amount || !operation.currency) {
      return null;
    }

    try {
      const reversal = await this.journalService.processWalletCreditJournal({
        userId: operation.userId,
        amount: Number(operation.amount),
        currency: operation.currency,
        info: `Reversal for provider operation ${operation.reference ?? operation.id}`,
        description: `REV-provider-operation-${operation.reference ?? operation.id}`,
        tag:
          operation.operationType === ProviderOperationType.EXTERNAL_TRANSFER
            ? TagType.WITHDRAWAL
            : TagType.BILLS,
        isReversal: true,
      });

      return reversal.reference ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to reverse wallet funds for provider operation ${operation.reference ?? operation.id}: ${error.message}`,
        error.stack,
      );

      metadata.walletDebitReversalError = error.message;
      return null;
    }
  }
}
