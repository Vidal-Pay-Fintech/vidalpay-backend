import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { User } from 'src/database/entities/user.entity';
import { Wallet } from 'src/database/entities/wallet.entity';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { Currency } from 'src/utils/enums/wallet.enum';
import {
  CardTopUpIntentPayload,
  ExternalTransferPayload,
  ProviderAccountResolutionPayload,
  ProviderAccountResolutionResult,
  ProviderAirtimeCatalog,
  ProviderBankCatalog,
  ProviderCardTopUpIntentExecution,
  ProviderCardTopUpStatus,
  ProviderDataCatalog,
  ProviderOperationExecution,
  ProviderProductPayload,
  ProviderUtilitiesCatalog,
  ProviderUtilityValidationPayload,
  ProviderUtilityValidationResult,
  ProviderWalletRail,
  ProviderWebhookExecution,
  RegionalProviderAdapter,
} from '../interfaces/regional-provider.interface';

abstract class MockBankingProviderBase implements RegionalProviderAdapter {
  abstract readonly provider: KycProvider;
  abstract readonly region: SupportedRegion;

  constructor(protected readonly featureFlags: FeatureFlagService) {}

  supportsOperation(operationType: ProviderOperationType): boolean {
    return [
      ProviderOperationType.RAIL_PROVISIONING,
      ProviderOperationType.CARD_TOPUP,
      ProviderOperationType.EXTERNAL_TRANSFER,
      ProviderOperationType.AIRTIME,
      ProviderOperationType.DATA,
      ProviderOperationType.UTILITY,
    ].includes(operationType);
  }

  async provisionReceiveRails(
    user: User,
    wallets: Wallet[],
  ): Promise<ProviderWalletRail[]> {
    return wallets
      .filter((wallet) => this.supportsWallet(wallet.currency))
      .map((wallet) => ({
        walletId: wallet.id,
        currency: wallet.currency,
        provider: this.provider,
        region: this.region,
        railType: this.region === SupportedRegion.NG ? 'VIRTUAL_ACCOUNT' : 'ACH',
        accountNumber:
          wallet.accountNumber ??
          this.numericString(`${wallet.id}${user.id}`, this.region === SupportedRegion.NG ? 10 : 12),
        routingNumber:
          wallet.routingNumber ??
          (this.region === SupportedRegion.US ? '021000021' : null),
        accountName:
          wallet.accountName ??
          [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ??
          user.email,
        bankName:
          wallet.bankName ??
          (this.region === SupportedRegion.NG
            ? 'Vidal Pay Mock Bank'
            : 'Lead Bank Mock'),
        sortCode: wallet.sortCode ?? null,
        providerCustomerId: wallet.providerCustomerId ?? `mock_cus_${user.id}`,
        providerAccountId: wallet.providerAccountId ?? `mock_acct_${wallet.id}`,
        providerVirtualAccountId:
          wallet.providerVirtualAccountId ?? `mock_va_${wallet.id}`,
        providerReference:
          wallet.providerReference ?? `mock_rail_${wallet.id}_${Date.now()}`,
        providerMetadata: {
          ...(wallet.providerMetadata ?? {}),
          demo: true,
          provisioningState: 'READY',
          mode: 'mock',
        },
      }));
  }

  async createExternalTransfer(
    payload: ExternalTransferPayload,
  ): Promise<ProviderOperationExecution> {
    return {
      provider: this.provider,
      operationType: ProviderOperationType.EXTERNAL_TRANSFER,
      status: this.nextStatus(),
      reference: this.reference('transfer'),
      externalReference: this.reference('provider'),
      responsePayload: {
        receiptId: this.reference('receipt'),
        destinationAccountNumber: payload.destinationAccountNumber,
        destinationBankCode: payload.destinationBankCode ?? null,
        destinationAccountName: payload.destinationAccountName ?? 'Demo Recipient',
        destinationBankName: payload.destinationBankName ?? this.defaultBankName(),
        processedAt: new Date().toISOString(),
      },
      metadata: {
        demo: true,
        narration: payload.narration ?? null,
      },
    };
  }

  async createCardTopUpIntent(
    payload: CardTopUpIntentPayload,
  ): Promise<ProviderCardTopUpIntentExecution> {
    const reference = this.reference('topup');
    return {
      provider: this.provider,
      operationType: ProviderOperationType.CARD_TOPUP,
      status: ProviderOperationStatus.PROCESSING,
      reference,
      externalReference: this.reference('checkout'),
      checkoutUrl: `https://checkout.vidalpay.test/${reference}`,
      redirectUrl: payload.redirectUrl ?? null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      responsePayload: {
        receiptId: this.reference('receipt'),
        amount: payload.amount,
        currency: payload.currency,
      },
      metadata: {
        demo: true,
      },
    };
  }

  async purchaseAirtime(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    return this.productExecution(ProviderOperationType.AIRTIME, payload);
  }

  async purchaseData(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    return this.productExecution(ProviderOperationType.DATA, payload);
  }

  async payUtility(
    payload: ProviderProductPayload,
  ): Promise<ProviderOperationExecution> {
    return this.productExecution(ProviderOperationType.UTILITY, payload);
  }

  async getAirtimeCatalog(): Promise<ProviderAirtimeCatalog> {
    return {
      region: this.region,
      provider: this.provider,
      source: 'CURATED_FALLBACK',
      message: 'Mock airtime catalog for demo mode.',
      networks: [
        {
          id: 'mtn-demo',
          code: 'MTN_DEMO',
          title: 'MTN Demo',
          description: 'Demo airtime network',
          billerCode: 'MTN',
          itemCode: 'AIRTIME',
          serviceCode: 'MTN:AIRTIME',
          currency: this.currency(),
          minAmount: 50,
          maxAmount: 50000,
          enabled: true,
        },
      ],
    };
  }

  async getDataCatalog(): Promise<ProviderDataCatalog> {
    return {
      region: this.region,
      provider: this.provider,
      source: 'CURATED_FALLBACK',
      message: 'Mock data catalog for demo mode.',
      networks: [
        {
          id: 'mtn-data-demo',
          code: 'MTN_DATA_DEMO',
          title: 'MTN Demo Data',
          description: 'Demo data network',
          billerCode: 'MTN_DATA',
          plans: [
            {
              id: '1gb-demo',
              code: '1GB_DEMO',
              title: '1GB Demo Plan',
              description: 'Demo data plan',
              amount: 500,
              currency: this.currency(),
              serviceCode: 'MTN_DATA:1GB',
              billerCode: 'MTN_DATA',
              itemCode: '1GB',
              type: 'DATA',
              enabled: true,
            },
          ],
        },
      ],
    };
  }

  async getUtilitiesCatalog(): Promise<ProviderUtilitiesCatalog> {
    return {
      region: this.region,
      provider: this.provider,
      source: 'CURATED_FALLBACK',
      message: 'Mock utilities catalog for demo mode.',
      categories: [
        {
          id: 'power-demo',
          code: 'POWER_DEMO',
          title: 'Power',
          description: 'Demo utility providers',
          providers: [
            {
              id: 'eko-demo',
              code: 'EKO_DEMO',
              title: 'Eko Electric Demo',
              description: 'Demo electricity biller',
              billerCode: 'EKO',
              itemCode: 'PREPAID',
              type: 'UTILITY',
              requiresValidation: true,
              customerReferenceLabel: 'Meter number',
              currency: this.currency(),
              enabled: true,
              items: [],
            },
          ],
        },
      ],
    };
  }

  async validateUtilityCustomer(
    payload: ProviderUtilityValidationPayload,
  ): Promise<ProviderUtilityValidationResult> {
    return {
      valid: true,
      validationAvailable: true,
      resolvedName: 'Demo Customer',
      customerReference: payload.customerReference,
      provider: {
        code: payload.providerCode ?? null,
        title: payload.providerTitle ?? 'Demo Utility',
        billerCode: payload.billerCode ?? null,
        itemCode: payload.itemCode ?? null,
        type: payload.type ?? null,
      },
      fee: 0,
      minimumAmount: 100,
      maximumAmount: 100000,
      currency: this.currency(),
      message: 'Customer validated in mock provider.',
      metadata: {
        demo: true,
        validationId: this.reference('validation'),
      },
    };
  }

  async getBankCatalog(): Promise<ProviderBankCatalog> {
    return {
      region: this.region,
      provider: this.provider,
      source: 'CURATED_FALLBACK',
      message: 'Mock bank catalog for demo mode.',
      banks: [
        {
          id: 'mock-bank',
          code: this.region === SupportedRegion.NG ? '999001' : '021000021',
          name: this.defaultBankName(),
          country: this.region,
          currency: this.currency(),
          enabled: true,
        },
      ],
    };
  }

  async resolveExternalAccount(
    payload: ProviderAccountResolutionPayload,
  ): Promise<ProviderAccountResolutionResult> {
    return {
      resolved: true,
      accountNumber: payload.destinationAccountNumber,
      accountName: 'Demo Recipient',
      bankCode:
        payload.destinationBankCode ??
        (this.region === SupportedRegion.NG ? '999001' : '021000021'),
      bankName: payload.destinationBankName ?? this.defaultBankName(),
      currency: payload.currency,
      provider: this.provider,
      message: 'Account resolved by mock provider.',
      metadata: {
        demo: true,
        resolutionId: this.reference('resolve'),
      },
    };
  }

  async getCardTopUpStatus(
    reference: string,
  ): Promise<ProviderCardTopUpStatus | null> {
    return {
      reference,
      status: 'SUCCESS',
      provider: this.provider,
      amount: null,
      currency: null,
      providerReference: this.reference('topup_status'),
      externalReference: this.reference('external'),
      message: 'Mock top-up completed.',
      creditedAt: new Date().toISOString(),
      checkoutUrl: `https://checkout.vidalpay.test/${reference}`,
      redirectUrl: null,
    };
  }

  async handleWebhook(
    payload: Record<string, any>,
  ): Promise<ProviderWebhookExecution> {
    return {
      provider: this.provider,
      eventType: String(payload.event ?? payload.type ?? 'mock.event'),
      eventReference: String(payload.id ?? payload.reference ?? this.reference('evt')),
      operationReference: String(payload.reference ?? '') || null,
      operationStatus: ProviderOperationStatus.COMPLETED,
      processed: true,
      metadata: {
        demo: true,
      },
    };
  }

  private productExecution(
    operationType: ProviderOperationType,
    payload: ProviderProductPayload,
  ): ProviderOperationExecution {
    return {
      provider: this.provider,
      operationType,
      status: this.nextStatus(),
      reference: this.reference(operationType.toLowerCase()),
      externalReference: this.reference('provider'),
      responsePayload: {
        receiptId: this.reference('receipt'),
        amount: payload.amount,
        currency: payload.currency,
        processedAt: new Date().toISOString(),
      },
      metadata: {
        demo: true,
      },
    };
  }

  private nextStatus() {
    return this.featureFlags.isEnabled('ENABLE_PROVIDER_PENDING_STATES')
      ? ProviderOperationStatus.PROCESSING
      : ProviderOperationStatus.COMPLETED;
  }

  private reference(prefix: string) {
    return `mock_${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  private numericString(seed: string, length: number) {
    const digits = seed.replace(/\D/g, '') || String(Date.now());
    return digits.padEnd(length, '0').slice(0, length);
  }

  private supportsWallet(currency: Currency) {
    return this.region === SupportedRegion.NG
      ? currency === Currency.NGN
      : currency === Currency.USD;
  }

  private currency() {
    return this.region === SupportedRegion.NG ? Currency.NGN : Currency.USD;
  }

  private defaultBankName() {
    return this.region === SupportedRegion.NG
      ? 'Vidal Pay Mock Bank'
      : 'Lead Bank Mock';
  }
}

@Injectable()
export class MockFlutterwaveBankingProviderService extends MockBankingProviderBase {
  readonly provider = KycProvider.FLUTTERWAVE;
  readonly region = SupportedRegion.NG;

  constructor(featureFlags: FeatureFlagService) {
    super(featureFlags);
  }
}

@Injectable()
export class MockLeadBankingProviderService extends MockBankingProviderBase {
  readonly provider = KycProvider.LEAD_BANK;
  readonly region = SupportedRegion.US;

  constructor(featureFlags: FeatureFlagService) {
    super(featureFlags);
  }
}
