import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Wallet } from 'src/database/entities/wallet.entity';
import { User } from 'src/database/entities/user.entity';
import {
  ExternalTransferPayload,
  ProviderOperationExecution,
  ProviderWalletRail,
  ProviderWebhookExecution,
  RegionalProviderAdapter,
} from '../interfaces/regional-provider.interface';

@Injectable()
export class LeadBankingProviderService implements RegionalProviderAdapter {
  readonly provider = KycProvider.LEAD_BANK;
  readonly region = SupportedRegion.US;

  supportsOperation(operationType: ProviderOperationType): boolean {
    return false;
  }

  async provisionReceiveRails(
    _user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]> {
    return wallets.map((wallet) => ({
      walletId: wallet.id,
      currency: wallet.currency,
      provider: this.provider,
      region: this.region,
      railType: 'ACH',
      accountNumber: wallet.accountNumber ?? null,
      routingNumber: wallet.routingNumber ?? null,
      accountName: wallet.accountName ?? null,
      bankName: wallet.bankName ?? null,
      sortCode: wallet.sortCode ?? null,
      providerCustomerId: wallet.providerCustomerId ?? null,
      providerAccountId: wallet.providerAccountId ?? null,
      providerVirtualAccountId: wallet.providerVirtualAccountId ?? null,
      providerReference: wallet.providerReference ?? null,
      providerMetadata: {
        ...(wallet.providerMetadata ?? {}),
        availability: 'UNAVAILABLE',
        blockedReason: 'Lead Bank is not connected yet in staging.',
      },
    }));
  }

  async createExternalTransfer(
    _payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution> {
    return {
      provider: this.provider,
      operationType: ProviderOperationType.EXTERNAL_TRANSFER,
      status: ProviderOperationStatus.FAILED,
      reference: `lead_unavailable_${Date.now()}`,
      responsePayload: {
        availability: 'UNAVAILABLE',
        blockedReason: 'Lead Bank is not connected yet in staging.',
      },
    };
  }

  async handleWebhook(
    payload: Record<string, any>,
  ): Promise<ProviderWebhookExecution> {
    return {
      provider: this.provider,
      eventType: String(payload.event ?? payload.type ?? 'lead-bank.unavailable'),
      eventReference: String(payload.id ?? payload.reference ?? '') || null,
      operationReference: String(payload.reference ?? '') || null,
      operationStatus: ProviderOperationStatus.FAILED,
      processed: false,
      ignored: true,
      metadata: {
        availability: 'UNAVAILABLE',
      },
    };
  }
}
