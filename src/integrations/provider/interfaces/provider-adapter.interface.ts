import { KycProvider } from 'src/common/enum/kyc-provider.enum';

export enum ProviderType {
  PAYMENT_NGN = 'payment_ngn',
  BANKING_USD = 'banking_usd',
  KYC = 'kyc',
  FX = 'fx',
  NOTIFICATION = 'notification',
  FRAUD = 'fraud',
  CRYPTO = 'crypto',
  INVESTMENT = 'investment',
  TAX = 'tax',
}

export enum ProviderCompletionStatus {
  MISSING = 'MISSING',
  BROKEN = 'BROKEN',
  PARTIAL = 'PARTIAL',
  COMPLETE_MOCK_READY = 'COMPLETE_MOCK_READY',
  COMPLETE_LIVE_TESTED = 'COMPLETE_LIVE_TESTED',
  PROVIDER_CREDENTIALS_MISSING = 'PROVIDER_CREDENTIALS_MISSING',
}

export enum ProviderReadinessState {
  DISABLED = 'DISABLED',
  MOCK_READY = 'MOCK_READY',
  PROVIDER_CREDENTIALS_MISSING = 'PROVIDER_CREDENTIALS_MISSING',
  CONFIGURED_NOT_TESTED = 'CONFIGURED_NOT_TESTED',
  LIVE_TESTED = 'LIVE_TESTED',
}

export interface ProviderHealthCheck {
  ok: boolean;
  checkedAt: string;
  providerReference?: string | null;
  message?: string | null;
}

export interface ProviderWebhookVerification {
  signatureValid: boolean;
  eventId?: string | null;
  idempotencyKey?: string | null;
  failureReason?: string | null;
}

export interface NormalizedProviderError {
  code: string;
  message: string;
  retryable: boolean;
  raw?: unknown;
}

export interface ProviderExecutionOperation<
  TPayload = Record<string, unknown>,
> {
  operationType: string;
  payload: TPayload;
  idempotencyKey?: string | null;
}

export interface ProviderExecutionResult<TData = Record<string, unknown>> {
  provider: KycProvider | string;
  providerReference: string | null;
  status: string;
  data: TData;
  raw?: unknown;
}

export interface StrictProviderAdapter {
  readonly providerName: string;
  readonly providerType: ProviderType;

  validateConfig(): void;
  healthCheck(): Promise<ProviderHealthCheck>;
  execute(
    operation: ProviderExecutionOperation,
  ): Promise<ProviderExecutionResult>;
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string,
  ): ProviderWebhookVerification | Promise<ProviderWebhookVerification>;
  normalizeStatus(providerStatus: string): string;
  normalizeError(error: unknown): NormalizedProviderError;
  getRequiredEnvVars(): string[];
  getCapabilities(): string[];
  supportsSandbox(): boolean;
  supportsLive(): boolean;
  getReadinessState(): ProviderReadinessState;
}
