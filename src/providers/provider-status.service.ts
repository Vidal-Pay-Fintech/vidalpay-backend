import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import {
  ProviderCompletionClassification,
  ProviderConnectionStatus,
  ProviderReadinessStatus,
  ProviderStatusView,
} from './provider-status.enum';

interface ProviderStatusDefinition {
  provider: string;
  providerType: string;
  modeKey: string;
  liveMode: string;
  enabledWhen: () => boolean;
  requiredLiveEnv?: string[];
  capabilities: string[];
  testEvidenceKey?: string;
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
        providerType: 'payment_ngn',
        modeKey: 'PAYMENT_PROVIDER_MODE',
        liveMode: 'flutterwave',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_NGN_WALLET') ||
          this.featureFlags.isEnabled('ENABLE_NGN_BANK_TRANSFER'),
        requiredLiveEnv: [
          'FLW_BASE_URL',
          'FLW_SECRET_KEY',
          'FLW_WEBHOOK_SECRET_HASH',
        ],
        capabilities: [
          'ngn_virtual_account',
          'ngn_bank_transfer',
          'account_resolution',
          'bills',
          'airtime',
          'data',
          'utilities',
          'card_topup',
          'webhooks',
        ],
        testEvidenceKey: 'FLUTTERWAVE_LIVE_TEST_EVIDENCE',
      },
      {
        provider: 'Lead Bank',
        providerType: 'banking_usd',
        modeKey: 'USD_PROVIDER_MODE',
        liveMode: 'leadbank',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_USD_WALLET') ||
          this.featureFlags.isEnabled('ENABLE_USD_BANK_TRANSFER'),
        requiredLiveEnv: ['LEAD_BANK_API_KEY', 'LEAD_BANK_WEBHOOK_SECRET'],
        capabilities: [
          'usd_account_provisioning',
          'ach_receive',
          'ach_transfer',
          'wire_transfer',
          'webhooks',
        ],
        testEvidenceKey: 'LEAD_BANK_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
      {
        provider: 'Smile ID',
        providerType: 'kyc',
        modeKey: 'KYC_PROVIDER_MODE',
        liveMode: 'smileid',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_DEMO_MODE'),
        requiredLiveEnv: ['SMILE_ID_API_KEY', 'SMILE_ID_WEBHOOK_SECRET'],
        capabilities: [
          'identity_verification',
          'document_verification',
          'liveness',
          'callback',
          'status_polling',
        ],
        testEvidenceKey: 'SMILE_ID_LIVE_TEST_EVIDENCE',
      },
      {
        provider: 'Verto',
        providerType: 'fx',
        modeKey: 'FX_PROVIDER_MODE',
        liveMode: 'verto',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_FX_CONVERSION_DEMO'),
        requiredLiveEnv: ['VERTO_API_KEY', 'VERTO_WEBHOOK_SECRET'],
        capabilities: [
          'fx_quote',
          'fx_conversion',
          'status_polling',
          'webhooks',
        ],
        testEvidenceKey: 'VERTO_LIVE_TEST_EVIDENCE',
      },
      {
        provider: 'Zero Hash',
        providerType: 'crypto',
        modeKey: 'CRYPTO_PROVIDER_MODE',
        liveMode: 'zerohash',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_CRYPTO_DEMO'),
        requiredLiveEnv: ['ZERO_HASH_API_KEY', 'ZERO_HASH_WEBHOOK_SECRET'],
        capabilities: ['assets', 'quote', 'trade', 'transactions', 'webhooks'],
        testEvidenceKey: 'ZERO_HASH_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
      {
        provider: 'Cowrywise',
        providerType: 'investment',
        modeKey: 'INVESTMENT_PROVIDER_MODE',
        liveMode: 'cowrywise',
        enabledWhen: () =>
          this.featureFlags.isEnabled('ENABLE_INVESTMENT_DEMO'),
        requiredLiveEnv: ['COWRYWISE_API_KEY', 'COWRYWISE_WEBHOOK_SECRET'],
        capabilities: ['products', 'portfolio', 'orders', 'webhooks'],
        testEvidenceKey: 'COWRYWISE_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
      {
        provider: 'April',
        providerType: 'tax',
        modeKey: 'TAX_PROVIDER_MODE',
        liveMode: 'april',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_TAX_DEMO'),
        requiredLiveEnv: ['APRIL_API_KEY', 'APRIL_WEBHOOK_SECRET'],
        capabilities: [
          'tax_status',
          'filing_start',
          'documents',
          'submit',
          'webhooks',
        ],
        testEvidenceKey: 'APRIL_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
      {
        provider: 'Column',
        providerType: 'tax',
        modeKey: 'TAX_PROVIDER_MODE',
        liveMode: 'column',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_TAX_DEMO'),
        requiredLiveEnv: ['COLUMN_API_KEY', 'COLUMN_WEBHOOK_SECRET'],
        capabilities: [
          'tax_status',
          'filing_start',
          'documents',
          'submit',
          'webhooks',
        ],
        testEvidenceKey: 'COLUMN_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
      {
        provider: 'OneSignal',
        providerType: 'notification',
        modeKey: 'NOTIFICATION_PROVIDER_MODE',
        liveMode: 'onesignal',
        enabledWhen: () => true,
        requiredLiveEnv: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'],
        capabilities: ['device_registration', 'push_delivery', 'templates'],
        testEvidenceKey: 'ONESIGNAL_LIVE_TEST_EVIDENCE',
      },
      {
        provider: 'Sardine',
        providerType: 'fraud',
        modeKey: 'FRAUD_PROVIDER_MODE',
        liveMode: 'sardine',
        enabledWhen: () => this.featureFlags.isEnabled('ENABLE_DEMO_MODE'),
        requiredLiveEnv: ['SARDINE_API_KEY', 'SARDINE_WEBHOOK_SECRET'],
        capabilities: ['risk_evaluation', 'aml_screening', 'webhooks'],
        testEvidenceKey: 'SARDINE_LIVE_TEST_EVIDENCE',
        comingSoon: true,
      },
    ];
  }

  private resolveProviderStatus(
    definition: ProviderStatusDefinition,
  ): ProviderStatusView {
    const mode = this.getMode(definition.modeKey);
    const enabled = definition.enabledWhen() || mode === definition.liveMode;
    const missingEnvVars = (definition.requiredLiveEnv ?? []).filter(
      (key) => !this.getRawConfigValue(key),
    );
    const envConfigured = missingEnvVars.length === 0;
    const testEvidence = this.getTestEvidence(definition);
    const liveTested = Boolean(testEvidence);

    if (!enabled) {
      return {
        provider: definition.provider,
        providerType: definition.providerType,
        status: ProviderConnectionStatus.DISABLED,
        readinessStatus: ProviderReadinessStatus.DISABLED,
        completionStatus: ProviderCompletionClassification.MISSING,
        mode,
        enabled: false,
        envConfigured,
        missingEnvVars,
        healthCheckStatus: 'UNKNOWN',
        lastHealthCheckAt: null,
        lastSuccessfulOperationAt: null,
        lastWebhookVerifiedAt: null,
        lastSandboxTestAt: null,
        liveTested: false,
        capabilities: definition.capabilities,
        testEvidence: null,
        failureReason: 'Provider feature flag is disabled.',
      };
    }

    if (mode === 'mock') {
      return {
        provider: definition.provider,
        providerType: definition.providerType,
        status: ProviderConnectionStatus.SANDBOX,
        readinessStatus: ProviderReadinessStatus.MOCK_READY,
        completionStatus: ProviderCompletionClassification.COMPLETE_MOCK_READY,
        mode,
        enabled: true,
        envConfigured,
        missingEnvVars,
        healthCheckStatus: 'UNKNOWN',
        lastHealthCheckAt: null,
        lastSuccessfulOperationAt: null,
        lastWebhookVerifiedAt: null,
        lastSandboxTestAt: null,
        liveTested: false,
        capabilities: definition.capabilities,
        testEvidence: null,
        failureReason:
          'Provider is running in mock mode; no live operation has been certified.',
      };
    }

    if (definition.comingSoon && mode !== definition.liveMode) {
      return {
        provider: definition.provider,
        providerType: definition.providerType,
        status: ProviderConnectionStatus.COMING_SOON,
        readinessStatus: ProviderReadinessStatus.DISABLED,
        completionStatus: ProviderCompletionClassification.PARTIAL,
        mode,
        enabled: true,
        envConfigured,
        missingEnvVars,
        healthCheckStatus: 'UNKNOWN',
        lastHealthCheckAt: null,
        lastSuccessfulOperationAt: null,
        lastWebhookVerifiedAt: null,
        lastSandboxTestAt: null,
        liveTested: false,
        capabilities: definition.capabilities,
        testEvidence: null,
        failureReason: `Mode ${mode} is not the supported live mode ${definition.liveMode}.`,
      };
    }

    if (!envConfigured) {
      return {
        provider: definition.provider,
        providerType: definition.providerType,
        status: ProviderConnectionStatus.PENDING,
        readinessStatus: ProviderReadinessStatus.PROVIDER_CREDENTIALS_MISSING,
        completionStatus:
          ProviderCompletionClassification.PROVIDER_CREDENTIALS_MISSING,
        mode,
        enabled: false,
        envConfigured: false,
        missingEnvVars,
        healthCheckStatus: 'FAIL',
        lastHealthCheckAt: null,
        lastSuccessfulOperationAt: null,
        lastWebhookVerifiedAt: null,
        lastSandboxTestAt: null,
        liveTested: false,
        capabilities: definition.capabilities,
        testEvidence: null,
        failureReason: 'PROVIDER_CREDENTIALS_MISSING',
      };
    }

    return {
      provider: definition.provider,
      providerType: definition.providerType,
      status: liveTested
        ? ProviderConnectionStatus.ACTIVE
        : ProviderConnectionStatus.PENDING,
      readinessStatus: liveTested
        ? ProviderReadinessStatus.LIVE_TESTED
        : ProviderReadinessStatus.CONFIGURED_NOT_TESTED,
      completionStatus: liveTested
        ? ProviderCompletionClassification.COMPLETE_LIVE_TESTED
        : ProviderCompletionClassification.PARTIAL,
      mode,
      enabled: liveTested,
      envConfigured: true,
      missingEnvVars: [],
      healthCheckStatus: liveTested ? 'PASS' : 'UNKNOWN',
      lastHealthCheckAt: this.getEvidenceString(testEvidence, 'healthCheckAt'),
      lastSuccessfulOperationAt: this.getEvidenceString(
        testEvidence,
        'successfulOperationAt',
      ),
      lastWebhookVerifiedAt: this.getEvidenceString(
        testEvidence,
        'webhookVerifiedAt',
      ),
      lastSandboxTestAt: this.getEvidenceString(testEvidence, 'sandboxTestAt'),
      liveTested,
      capabilities: definition.capabilities,
      testEvidence,
      failureReason: liveTested
        ? null
        : 'Provider credentials are configured, but no live-tested evidence has been recorded.',
    };
  }

  private getMode(key: string) {
    return this.getConfigValue(key) || 'mock';
  }

  private getConfigValue(key: string) {
    return this.getRawConfigValue(key).toLowerCase();
  }

  private getRawConfigValue(key: string) {
    return String(
      this.configService.get<string>(key) ?? process.env[key] ?? '',
    ).trim();
  }

  private getTestEvidence(
    definition: ProviderStatusDefinition,
  ): Record<string, unknown> | null {
    if (!definition.testEvidenceKey) {
      return null;
    }

    const rawEvidence = this.getRawConfigValue(definition.testEvidenceKey);
    if (!rawEvidence) {
      return null;
    }

    try {
      return JSON.parse(rawEvidence) as Record<string, unknown>;
    } catch {
      return {
        evidenceId: rawEvidence,
      };
    }
  }

  private getEvidenceString(
    evidence: Record<string, unknown> | null,
    key: string,
  ) {
    const value = evidence?.[key];
    return typeof value === 'string' && value.trim().length ? value : null;
  }
}
