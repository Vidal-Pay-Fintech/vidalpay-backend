import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Wallet } from 'src/database/entities/wallet.entity';
import { User } from 'src/database/entities/user.entity';
import { Currency } from 'src/utils/enums/wallet.enum';
import {
  ExternalTransferPayload,
  ProviderOperationExecution,
  ProviderWalletRail,
  ProviderWebhookExecution,
  RegionalProviderAdapter,
} from '../interfaces/regional-provider.interface';
import { createHash } from 'crypto';

@Injectable()
export class LeadBankingProviderService implements RegionalProviderAdapter {
  readonly provider = KycProvider.LEAD_BANK;
  readonly region = SupportedRegion.US;

  supportsOperation(operationType: ProviderOperationType): boolean {
    return [
      ProviderOperationType.RAIL_PROVISIONING,
      ProviderOperationType.EXTERNAL_TRANSFER,
    ].includes(operationType);
  }

  async provisionReceiveRails(
    user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]> {
    return wallets
      .filter((wallet) => wallet.currency === Currency.USD)
      .map((wallet) => ({
        walletId: wallet.id,
        currency: wallet.currency,
        provider: this.provider,
        region: this.region,
        railType: 'ACH',
        accountNumber: this.generateDigits(
          `${this.provider}:${wallet.id}:account`,
          12,
        ),
        routingNumber: this.generateDigits(
          `${this.provider}:${wallet.id}:routing`,
          9,
        ),
        accountName: this.buildAccountName(user),
        bankName: 'Lead Bank',
        sortCode: null,
        providerCustomerId: `lead_cus_${user.id}`,
        providerAccountId: `lead_acc_${wallet.id}`,
        providerVirtualAccountId: null,
        providerReference: `lead_rail_${wallet.id}`,
        providerMetadata: {
          railType: 'ACH',
          supports: ['deposit', 'receive', 'external-transfer'],
          staging: true,
        },
      }));
  }

  async createExternalTransfer(
    payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution> {
    return {
      provider: this.provider,
      operationType: ProviderOperationType.EXTERNAL_TRANSFER,
      status: ProviderOperationStatus.PROCESSING,
      reference: `lead_ext_${payload.wallet.id}_${Date.now()}`,
      externalReference: `lead_ach_${payload.wallet.id}_${Date.now()}`,
      responsePayload: {
        staging: true,
        destinationBankName: payload.destinationBankName ?? null,
        destinationAccountNumber: payload.destinationAccountNumber,
        destinationRoutingNumber: payload.destinationRoutingNumber ?? null,
      },
    };
  }

  async handleWebhook(
    payload: Record<string, any>,
  ): Promise<ProviderWebhookExecution> {
    return {
      provider: this.provider,
      eventType: String(payload.event ?? payload.type ?? 'lead-bank.unknown'),
      eventReference: String(payload.id ?? payload.reference ?? '') || null,
      operationReference: String(payload.reference ?? '') || null,
      operationStatus:
        payload.status === 'completed'
          ? ProviderOperationStatus.COMPLETED
          : payload.status === 'failed'
            ? ProviderOperationStatus.FAILED
            : ProviderOperationStatus.PROCESSING,
      processed: true,
      metadata: {
        staging: true,
      },
    };
  }

  private buildAccountName(user: User) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return fullName || user.email;
  }

  private generateDigits(seed: string, length: number): string {
    const hex = createHash('sha256').update(seed).digest('hex');
    const digits = hex
      .split('')
      .map((char) => (parseInt(char, 16) % 10).toString())
      .join('');

    return digits.slice(0, length);
  }
}
