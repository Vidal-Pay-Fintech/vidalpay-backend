export enum ProviderConnectionStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SANDBOX = 'SANDBOX',
  COMING_SOON = 'COMING_SOON',
  DISABLED = 'DISABLED',
}

export enum ProviderReadinessStatus {
  DISABLED = 'DISABLED',
  MOCK_READY = 'MOCK_READY',
  PROVIDER_CREDENTIALS_MISSING = 'PROVIDER_CREDENTIALS_MISSING',
  CONFIGURED_NOT_TESTED = 'CONFIGURED_NOT_TESTED',
  LIVE_TESTED = 'LIVE_TESTED',
}

export enum ProviderCompletionClassification {
  MISSING = 'MISSING',
  BROKEN = 'BROKEN',
  PARTIAL = 'PARTIAL',
  COMPLETE_MOCK_READY = 'COMPLETE_MOCK_READY',
  COMPLETE_LIVE_TESTED = 'COMPLETE_LIVE_TESTED',
  PROVIDER_CREDENTIALS_MISSING = 'PROVIDER_CREDENTIALS_MISSING',
}

export interface ProviderStatusView {
  provider: string;
  providerType: string;
  status: ProviderConnectionStatus;
  readinessStatus: ProviderReadinessStatus;
  completionStatus: ProviderCompletionClassification;
  mode: string;
  enabled: boolean;
  envConfigured: boolean;
  missingEnvVars: string[];
  healthCheckStatus: 'UNKNOWN' | 'PASS' | 'FAIL';
  lastHealthCheckAt: string | null;
  lastSuccessfulOperationAt: string | null;
  lastWebhookVerifiedAt: string | null;
  lastSandboxTestAt: string | null;
  liveTested: boolean;
  capabilities: string[];
  testEvidence: Record<string, unknown> | null;
  failureReason: string | null;
}
