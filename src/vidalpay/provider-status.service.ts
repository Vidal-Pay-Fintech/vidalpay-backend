import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FincraConfigurationError, resolveFincraConfiguration } from './fincra-configuration';
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
  private readonly capabilityConfig: Record<
    ProviderCapability,
    CapabilityConfig
  > = {
    usd_wallet: {
      provider: 'Fincra',
      providerType: 'BANKING',
      service: 'Fincra USD virtual accounts',
      envVars: ['FINCRA_API_KEY'],
    },
    ngn_wallet: {
      provider: 'Fincra',
      providerType: 'BANKING',
      service: 'Fincra NGN virtual accounts',
      envVars: ['FINCRA_API_KEY'],
    },
    usd_account_details: {
      provider: 'Fincra',
      providerType: 'BANKING',
      service: 'Fincra USD virtual account details',
      envVars: ['FINCRA_API_KEY'],
    },
    ngn_account_details: {
      provider: 'Fincra',
      providerType: 'BANKING',
      service: 'Fincra NGN virtual account details',
      envVars: ['FINCRA_API_KEY'],
    },
    wallet_activation: {
      provider: 'Fincra',
      providerType: 'BANKING',
      service: 'Fincra virtual account activation requests',
      envVars: ['FINCRA_API_KEY'],
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
      provider: 'Sudo',
      providerType: 'CARD',
      service: 'Sudo sandbox NGN virtual cards',
      envVars: ['SUDO_API_KEY', 'SUDO_CARD_PROGRAM_ID'],
    },
    ngn_physical_card: {
      provider: 'Sudo',
      providerType: 'CARD',
      service: 'Sudo sandbox NGN physical cards',
      envVars: ['SUDO_API_KEY', 'SUDO_CARD_PROGRAM_ID'],
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
      provider: 'VTU.ng/Reloadly',
      providerType: 'BILLS',
      service: 'Airtime catalog',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
        ['RELOADLY_CLIENT_ID', 'RELOADLY_CLIENT_SECRET'],
      ],
    },
    airtime_purchase: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng airtime purchase with ledger hold and reconciliation',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    data_catalog: {
      provider: 'VTU.ng/Reloadly',
      providerType: 'BILLS',
      service: 'Data catalog',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
        ['RELOADLY_CLIENT_ID', 'RELOADLY_CLIENT_SECRET'],
      ],
    },
    data_purchase: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng data purchase with ledger hold and reconciliation',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    utilities_catalog: {
      provider: 'VTU.ng/Reloadly',
      providerType: 'BILLS',
      service: 'Utility and biller catalog',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
        ['RELOADLY_CLIENT_ID', 'RELOADLY_CLIENT_SECRET'],
      ],
    },
    utilities_validate: {
      provider: 'VTU.ng/Reloadly',
      providerType: 'BILLS',
      service: 'Utility customer validation',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
        ['RELOADLY_CLIENT_ID', 'RELOADLY_CLIENT_SECRET'],
      ],
    },
    utilities_payment: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng bill payment with ledger hold and reconciliation',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    fx_quote: {
      provider: 'Fincra',
      providerType: 'FX',
      service: 'Backend FX quote provider',
      envVars: ['FINCRA_API_KEY'],
    },
    fx_convert: {
      provider: 'Fincra',
      providerType: 'FX',
      service: 'Fincra conversion quotes and settlement',
      envVars: ['FINCRA_API_KEY', 'FINCRA_BUSINESS_ID', 'FINCRA_WEBHOOK_SECRET'],
    },
    bank_transfer: {
      provider: 'Fincra',
      providerType: 'TRANSFER',
      service: 'Fincra bank payout execution',
      envVars: [],
      unsupported: true,
      failureReason:
        'Fincra bank payout execution and settlement reconciliation are not enabled in this backend yet.',
    },
    tag_transfer: {
      provider: 'VidalPay',
      providerType: 'INTERNAL',
      service: 'VidalPay internal ledger',
      envVars: [],
    },
    crypto_overview: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card crypto/stablecoin provider',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    crypto_assets: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card supported fiat/stablecoin asset catalog',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    crypto_rates: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card read-only crypto/stablecoin rates',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    crypto_quote: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card read-only crypto/stablecoin quote',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    crypto_deposit: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card stablecoin receive/deposit provider',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    crypto_withdrawal: {
      provider: 'Yellow Card',
      providerType: 'CRYPTO',
      service: 'Yellow Card stablecoin send/withdrawal provider',
      envVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
    },
    investments_account: {
      provider: 'Investment provider',
      providerType: 'INVESTMENT',
      service: 'Investment account provider',
      envVars: ['ALPACA_BROKER_API_KEY', 'ALPACA_BROKER_API_SECRET'],
    },
    investments_products: {
      provider: 'Investment provider',
      providerType: 'INVESTMENT',
      service: 'Investment product provider',
      envVars: ['ALPACA_BROKER_API_KEY', 'ALPACA_BROKER_API_SECRET'],
    },
    investments_orders: {
      provider: 'Investment provider',
      providerType: 'INVESTMENT',
      service: 'Investment order provider',
      envVars: ['ALPACA_BROKER_API_KEY', 'ALPACA_BROKER_API_SECRET'],
    },
    usd_loans: {
      provider: 'Unit.co',
      providerType: 'CREDIT',
      service: 'Unit credit accounts',
      envVars: ['UNIT_API_TOKEN'],
      unsupported: true,
      failureReason:
        'Unit credit support is not contractually enabled or sandbox-tested for VidalPay.',
    },
    usd_loan_eligibility: {
      provider: 'Unit.co',
      providerType: 'CREDIT',
      service: 'Unit credit program eligibility',
      envVars: ['UNIT_API_TOKEN'],
      unsupported: true,
      failureReason:
        'Unit credit eligibility is not contractually enabled or sandbox-tested for VidalPay.',
    },
    usd_loan_application: {
      provider: 'Unit.co',
      providerType: 'CREDIT',
      service: 'Unit credit application flow',
      envVars: ['UNIT_API_TOKEN'],
      unsupported: true,
      failureReason:
        'Unit credit applications are not contractually enabled or sandbox-tested for VidalPay.',
    },
    usd_loan_repayment: {
      provider: 'Unit.co',
      providerType: 'CREDIT',
      service: 'Unit credit repayment',
      envVars: ['UNIT_API_TOKEN'],
      unsupported: true,
      failureReason:
        'Unit credit repayment is not contractually enabled or sandbox-tested for VidalPay.',
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
    zendesk_support: {
      provider: 'Zendesk',
      providerType: 'SUPPORT',
      service: 'Zendesk ticket sync and ticket-status webhooks',
      envVars: ['ZENDESK_SUBDOMAIN', 'ZENDESK_OAUTH_TOKEN'],
    },
    whatsapp_support: {
      provider: 'WhatsApp Cloud API',
      providerType: 'SUPPORT_CHAT',
      service: 'WhatsApp live support conversations and webhooks',
      envVars: [
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      ],
    },
    vtu_catalog: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng airtime/data/utility catalog',
      envVars: [],
      envVarGroups: [
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_PROVIDER', 'VTU_BASE_URL', 'VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    vtu_validate: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng utility customer validation',
      envVars: [],
      envVarGroups: [
        ['VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    vtu_purchase: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng airtime/data/utility purchase',
      envVars: [],
      envVarGroups: [
        ['VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_EMAIL', 'VTU_PASSWORD'],
      ],
    },
    vtu_requery: {
      provider: 'VTU.ng',
      providerType: 'BILLS',
      service: 'VTU.ng transaction status requery',
      envVars: [],
      envVarGroups: [
        ['VTU_USERNAME', 'VTU_PASSWORD'],
        ['VTU_EMAIL', 'VTU_PASSWORD'],
      ],
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
      envVars: ['APRIL_API_KEY'],
      unsupported: true,
      failureReason:
        'April Tax partner sandbox documentation and validated access have not been supplied.',
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

  private hasUsableConfiguration(envVar: string): boolean {
    const value = this.configService.get<string>(envVar)?.trim();
    if (!value) return false;
    const normalized = value.toLowerCase();
    if (
      normalized.startsWith('your_') ||
      normalized.startsWith('your-') ||
      normalized.includes('changeme') ||
      normalized.includes('replace_me') ||
      normalized === 'test'
    ) {
      return false;
    }
    if (envVar.endsWith('_URL')) {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    }
    return true;
  }

  getStatus(capability: ProviderCapability): ProviderStatusItem {
    const config = this.capabilityConfig[capability];
    let mode = this.configService.get<string>('NODE_ENV') ?? 'development';
    let configurationError: string | null = null;
    if (config.provider === 'Fincra') {
      try {
        mode = resolveFincraConfiguration((key) => this.configService.get<string>(key)).environment;
      } catch (error) {
        if (!(error instanceof FincraConfigurationError)) throw error;
        configurationError = error.message;
      }
    }
    const missingEnvVars = config.envVarGroups
      ? config.envVarGroups.some((group) =>
          group.every((envVar) => this.hasUsableConfiguration(envVar)),
        )
        ? []
        : config.envVarGroups.map((group) => group.join(' + '))
      : config.envVars.filter((envVar) => !this.hasUsableConfiguration(envVar));
    const envConfigured = missingEnvVars.length === 0 && !configurationError;
    const internalProvider = config.provider === 'VidalPay';
    const enabled = !config.unsupported && (envConfigured || internalProvider);
    const readinessStatus = configurationError ? 'INVALID_CONFIGURATION' : config.unsupported
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
      configurationError ?? config.failureReason ??
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
      mode,
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
