import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProviderCapability,
  ProviderStatusItem,
  REQUIRED_PROVIDER_CAPABILITIES,
} from './contracts';

type CapabilityConfig = {
  provider: string;
  providerType: string;
  service: string;
  envVars: string[];
  envVarGroups?: string[][];
  unsupported?: boolean;
  failureReason?: string;
};

@Injectable()
export class ProviderStatusService {
  private readonly capabilityConfig: Record<ProviderCapability, CapabilityConfig> =
    {
      usd_wallet: {
        provider: 'Unit.co',
        providerType: 'BANKING',
        service: 'Unit sandbox deposit accounts',
        envVars: ['UNIT_API_TOKEN'],
      },
      ngn_wallet: {
        provider: 'PayVessel',
        providerType: 'BANKING',
        service: 'PayVessel virtual accounts/wallets',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      usd_account_details: {
        provider: 'Unit.co',
        providerType: 'BANKING',
        service: 'Unit sandbox deposit account routing details',
        envVars: ['UNIT_API_TOKEN'],
      },
      ngn_account_details: {
        provider: 'PayVessel',
        providerType: 'BANKING',
        service: 'PayVessel dedicated virtual accounts',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      usd_virtual_card: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit sandbox virtual debit cards',
        envVars: ['UNIT_API_TOKEN'],
      },
      usd_physical_card: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit sandbox physical debit cards',
        envVars: ['UNIT_API_TOKEN'],
      },
      ngn_virtual_card: {
        provider: 'PayVessel',
        providerType: 'CARD',
        service: 'PayVessel card issuing',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
        unsupported: true,
        failureReason:
          'The documented PayVessel card API issues USD virtual cards; NGN virtual card support was not confirmed in the official docs reviewed.',
      },
      ngn_physical_card: {
        provider: 'PayVessel',
        providerType: 'CARD',
        service: 'PayVessel card issuing',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
        unsupported: true,
        failureReason:
          'PayVessel physical card issuing was not found in the official docs reviewed.',
      },
      card_topup: {
        provider: 'VidalPay',
        providerType: 'PAYMENT',
        service: 'Card top-up provider',
        envVars: ['CARD_TOPUP_PROVIDER', 'CARD_TOPUP_SECRET_KEY'],
      },
      card_freeze: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit card lifecycle',
        envVars: ['UNIT_API_TOKEN'],
      },
      card_unfreeze: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit card lifecycle',
        envVars: ['UNIT_API_TOKEN'],
      },
      card_terminate: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit card lifecycle',
        envVars: ['UNIT_API_TOKEN'],
      },
      card_limits: {
        provider: 'Unit.co',
        providerType: 'CARD',
        service: 'Unit card limits/settings',
        envVars: ['UNIT_API_TOKEN'],
      },
      airtime_catalog: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller catalog',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      airtime_purchase: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller order',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      data_catalog: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller catalog',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      data_purchase: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller order',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      utilities_catalog: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller catalog',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      utilities_validate: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller customer validation',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      utilities_payment: {
        provider: 'PayVessel',
        providerType: 'BILLS',
        service: 'PayVessel biller reseller order',
        envVars: ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
      },
      fx_quote: {
        provider: 'FX provider',
        providerType: 'FX',
        service: 'Backend FX quote provider',
        envVars: ['FX_PROVIDER_BASE_URL', 'FX_PROVIDER_API_KEY'],
      },
      fx_convert: {
        provider: 'FX provider',
        providerType: 'FX',
        service: 'Backend FX conversion provider',
        envVars: ['FX_PROVIDER_BASE_URL', 'FX_PROVIDER_API_KEY'],
      },
      bank_transfer: {
        provider: 'PayVessel/Unit.co',
        providerType: 'TRANSFER',
        service: 'Provider bank transfer rails',
        envVars: [],
        envVarGroups: [
          ['UNIT_API_TOKEN'],
          ['PAYVESSEL_API_KEY', 'PAYVESSEL_API_SECRET'],
        ],
      },
      tag_transfer: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay internal ledger',
        envVars: [],
      },
      crypto_overview: {
        provider: 'Crypto provider',
        providerType: 'CRYPTO',
        service: 'Crypto overview provider',
        envVars: ['CRYPTO_PROVIDER', 'CRYPTO_PROVIDER_API_KEY'],
      },
      crypto_assets: {
        provider: 'Crypto provider',
        providerType: 'CRYPTO',
        service: 'Crypto asset catalog provider',
        envVars: ['CRYPTO_PROVIDER', 'CRYPTO_PROVIDER_API_KEY'],
      },
      crypto_deposit: {
        provider: 'Crypto provider',
        providerType: 'CRYPTO',
        service: 'Crypto deposit provider',
        envVars: ['CRYPTO_PROVIDER', 'CRYPTO_PROVIDER_API_KEY'],
      },
      crypto_withdrawal: {
        provider: 'Crypto provider',
        providerType: 'CRYPTO',
        service: 'Crypto withdrawal provider',
        envVars: ['CRYPTO_PROVIDER', 'CRYPTO_PROVIDER_API_KEY'],
      },
      investments_account: {
        provider: 'Investment provider',
        providerType: 'INVESTMENT',
        service: 'Investment account provider',
        envVars: ['INVESTMENT_PROVIDER', 'INVESTMENT_PROVIDER_API_KEY'],
      },
      investments_products: {
        provider: 'Investment provider',
        providerType: 'INVESTMENT',
        service: 'Investment product provider',
        envVars: ['INVESTMENT_PROVIDER', 'INVESTMENT_PROVIDER_API_KEY'],
      },
      investments_orders: {
        provider: 'Investment provider',
        providerType: 'INVESTMENT',
        service: 'Investment order provider',
        envVars: ['INVESTMENT_PROVIDER', 'INVESTMENT_PROVIDER_API_KEY'],
      },
      usd_loans: {
        provider: 'Unit.co',
        providerType: 'CREDIT',
        service: 'Unit credit accounts',
        envVars: ['UNIT_API_TOKEN'],
      },
      usd_loan_eligibility: {
        provider: 'Unit.co',
        providerType: 'CREDIT',
        service: 'Unit credit program eligibility',
        envVars: ['UNIT_API_TOKEN'],
      },
      usd_loan_application: {
        provider: 'Unit.co',
        providerType: 'CREDIT',
        service: 'Unit credit application flow',
        envVars: ['UNIT_API_TOKEN'],
      },
      usd_loan_repayment: {
        provider: 'Unit.co',
        providerType: 'CREDIT',
        service: 'Unit credit repayment',
        envVars: ['UNIT_API_TOKEN'],
      },
      notifications: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay notification registry',
        envVars: [],
      },
      support_tickets: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay support tickets',
        envVars: [],
      },
      disputes: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay dispute intake',
        envVars: [],
      },
      tax: {
        provider: 'Tax provider',
        providerType: 'TAX',
        service: 'Tax filing provider',
        envVars: ['TAX_PROVIDER', 'TAX_PROVIDER_API_KEY'],
      },
      rewards: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay rewards ledger/history',
        envVars: [],
      },
      referrals: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay referral codes and invite tracking',
        envVars: [],
      },
      qr_payments: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay QR payment contract',
        envVars: [],
        unsupported: true,
        failureReason:
          'The backend has no implemented QR payment ledger flow yet.',
      },
      money_requests: {
        provider: 'VidalPay',
        providerType: 'INTERNAL',
        service: 'VidalPay money request contract',
        envVars: [],
        unsupported: true,
        failureReason:
          'The backend has no implemented money request workflow yet.',
      },
    };

  constructor(private readonly configService: ConfigService) {}

  getStatus(capability: ProviderCapability): ProviderStatusItem {
    const config = this.capabilityConfig[capability];
    const missingEnvVars = config.envVarGroups
      ? config.envVarGroups.some((group) =>
          group.every((envVar) => this.configService.get<string>(envVar)),
        )
        ? []
        : config.envVarGroups.map((group) => group.join(' + '))
      : config.envVars.filter(
          (envVar) => !this.configService.get<string>(envVar),
        );
    const envConfigured = missingEnvVars.length === 0;
    const internalProvider = config.provider === 'VidalPay';
    const enabled = !config.unsupported && (envConfigured || internalProvider);
    const readinessStatus = config.unsupported
      ? 'UNSUPPORTED'
      : enabled
        ? internalProvider
          ? 'READY'
          : 'CONFIGURED_NOT_LIVE_TESTED'
        : 'MISSING_CREDENTIALS';
    const status = config.unsupported
      ? 'UNSUPPORTED'
      : enabled
        ? 'AVAILABLE'
        : 'UNAVAILABLE';
    const failureReason =
      config.failureReason ??
      (missingEnvVars.length
        ? `Missing backend environment variables: ${missingEnvVars.join(', ')}`
        : null);

    return {
      provider: config.provider,
      providerType: config.providerType,
      capability,
      enabled,
      envConfigured,
      liveTested: internalProvider && enabled,
      status,
      readinessStatus,
      missingEnvVars,
      failureReason,
      service: config.service,
      capabilities: [capability],
      mode: this.configService.get<string>('NODE_ENV') ?? 'development',
    };
  }

  getStatuses(): ProviderStatusItem[] {
    return REQUIRED_PROVIDER_CAPABILITIES.map((capability) =>
      this.getStatus(capability),
    );
  }

  isCapabilityEnabled(capability: ProviderCapability): boolean {
    return this.getStatus(capability).enabled;
  }
}
