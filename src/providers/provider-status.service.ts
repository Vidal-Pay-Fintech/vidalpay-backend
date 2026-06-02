import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import {
  ProviderConnectionStatus,
  ProviderStatusView,
} from './provider-status.enum';

interface ProviderStatusDefinition {
  provider: string;
  modeKey: string;
  liveMode: string;
  enabledWhen: () => boolean;
  requiredLiveEnv?: string[];
  comingSoon?: boolean;
}

@Injectable()
export class ProviderStatusService {
  constructor(
    private readonly configService: ConfigService,
    private readonly featureFlags: FeatureFlagService,
  ) {}

  getProviderStatuses(): ProviderStatusView[] {
    return this.getDefinitions().map((definition) =>
      this.resolveProviderStatus(definition),
    );
  }

  getProviderModes() {
    return this.getDefinitions().reduce<Record<string, string>>(
      (modes, definition) => {
        modes[definition.provider] = this.getMode(definition.modeKey);
        return modes;
      },
      {},
    );
  }

  private getDefinitions(): ProviderStatusDefinition[] {
    return [
      {
        provider: 'Flutterwave',
        modeKey: 'PAYMENT_PROVIDER_MODE',
        liveMode: 'flutterwave',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_NGN_WALLET') ||
          this.featureFlags.isEnabled('ENABLE_NGN_BANK_TRANSFER'),
        requiredLiveEnv: ['FLW_BASE_URL', 'FLW_SECRET_KEY'],
      },
      {
        provider: 'Lead Bank',
        modeKey: 'USD_PROVIDER_MODE',
        liveMode: 'leadbank',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_USD_WALLET') ||
          this.featureFlags.isEnabled('ENABLE_USD_BANK_TRANSFER'),
        requiredLiveEnv: ['LEAD_BANK_API_KEY'],
        comingSoon: true,
      },
      {
        provider: 'Smile ID',
        modeKey: 'KYC_PROVIDER_MODE',
        liveMode: 'smileid',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_DEMO_MODE'),
        requiredLiveEnv: ['SMILE_ID_API_KEY'],
      },
      {
        provider: 'Verto',
        modeKey: 'FX_PROVIDER_MODE',
        liveMode: 'verto',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_FX_CONVERSION_DEMO'),
        requiredLiveEnv: ['VERTO_API_KEY'],
      },
      {
        provider: 'Zero Hash',
        modeKey: 'CRYPTO_PROVIDER_MODE',
        liveMode: 'zerohash',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_CRYPTO_DEMO'),
        requiredLiveEnv: ['ZERO_HASH_API_KEY'],
        comingSoon: true,
      },
      {
        provider: 'Cowrywise',
        modeKey: 'INVESTMENT_PROVIDER_MODE',
        liveMode: 'cowrywise',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_INVESTMENT_DEMO'),
        requiredLiveEnv: ['COWRYWISE_API_KEY'],
        comingSoon: true,
      },
      {
        provider: 'April',
        modeKey: 'TAX_PROVIDER_MODE',
        liveMode: 'april',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_TAX_DEMO'),
        requiredLiveEnv: ['APRIL_API_KEY'],
        comingSoon: true,
      },
      {
        provider: 'Column',
        modeKey: 'TAX_PROVIDER_MODE',
        liveMode: 'column',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_TAX_DEMO'),
        requiredLiveEnv: ['COLUMN_API_KEY'],
        comingSoon: true,
      },
      {
        provider: 'OneSignal',
        modeKey: 'NOTIFICATION_PROVIDER_MODE',
        liveMode: 'onesignal',
        enabledWhen: () => true,
        requiredLiveEnv: ['ONESIGNAL_APP_ID'],
      },
      {
        provider: 'Sardine',
        modeKey: 'FRAUD_PROVIDER_MODE',
        liveMode: 'sardine',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_DEMO_MODE'),
        requiredLiveEnv: ['SARDINE_API_KEY'],
        comingSoon: true,
      },
    ];
  }

  private resolveProviderStatus(
    definition: ProviderStatusDefinition,
  ): ProviderStatusView {
    const mode = this.getMode(definition.modeKey);
    const enabled = definition.enabledWhen();

    if (!enabled) {
      return {
        provider: definition.provider,
        status: ProviderConnectionStatus.DISABLED,
        mode,
        enabled: false,
      };
    }

    if (mode === 'mock') {
      return {
        provider: definition.provider,
        status: ProviderConnectionStatus.SANDBOX,
        mode,
        enabled: true,
      };
    }

    if (definition.comingSoon && mode !== definition.liveMode) {
      return {
        provider: definition.provider,
        status: ProviderConnectionStatus.COMING_SOON,
        mode,
        enabled: true,
      };
    }

    if (definition.requiredLiveEnv?.some((key) => !this.getConfigValue(key))) {
      return {
        provider: definition.provider,
        status: this.featureFlags.isEnabled('ENABLE_PROVIDER_PENDING_STATES')
          ? ProviderConnectionStatus.PENDING
          : ProviderConnectionStatus.DISABLED,
        mode,
        enabled: this.featureFlags.isEnabled('ENABLE_PROVIDER_PENDING_STATES'),
      };
    }

    return {
      provider: definition.provider,
      status:
        mode === definition.liveMode
          ? ProviderConnectionStatus.ACTIVE
          : ProviderConnectionStatus.COMING_SOON,
      mode,
      enabled: mode === definition.liveMode,
    };
  }

  private getMode(key: string) {
    return this.getConfigValue(key) || 'mock';
  }

  private getConfigValue(key: string) {
    return String(this.configService.get<string>(key) ?? process.env[key] ?? '')
      .trim()
      .toLowerCase();
  }
}
