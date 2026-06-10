import { createHmac, createVerify, timingSafeEqual, randomUUID } from 'crypto';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  NormalizedProviderError,
  ProviderExecutionOperation,
  ProviderExecutionResult,
  ProviderHealthCheck,
  ProviderReadinessState,
  ProviderType,
  ProviderWebhookVerification,
  StrictProviderAdapter,
} from '../interfaces/provider-adapter.interface';

type HeaderMap = Record<string, string | string[] | undefined>;

interface LiveProviderSpec {
  slug: string;
  providerName: KycProvider;
  providerType: ProviderType;
  modeEnvKey: string;
  liveMode: string;
  requiredEnvVars: string[];
  capabilities: string[];
  baseUrlEnvKey?: string;
  apiKeyEnvKey?: string;
  authScheme?: 'bearer' | 'basic' | 'api-key' | 'key';
  apiKeyHeader?: string;
  healthPath?: string;
  webhook: WebhookVerificationSpec;
  supportsSandbox: boolean;
  supportsLive: boolean;
}

type WebhookVerificationSpec =
  | {
      type: 'header-secret';
      secretEnvKey: string;
      headerNames: string[];
    }
  | {
      type: 'hmac';
      secretEnvKey: string;
      algorithm: 'sha256' | 'sha512';
      headerNames: string[];
      signaturePrefix?: string;
    }
  | {
      type: 'rsa-sha256-or-hmac';
      publicKeyEnvKey: string;
      hmacSecretEnvKey: string;
      headerNames: string[];
      timestampHeaderNames: string[];
    }
  | {
      type: 'none';
    };

export class ProviderCredentialsMissingError extends Error {
  constructor(readonly missingEnvVars: string[]) {
    super(`PROVIDER_CREDENTIALS_MISSING: ${missingEnvVars.join(', ')}`);
    this.name = 'ProviderCredentialsMissingError';
  }
}

export class LiveProviderAdapter implements StrictProviderAdapter {
  readonly providerName: string;
  readonly providerType: ProviderType;

  constructor(protected readonly spec: LiveProviderSpec) {
    this.providerName = spec.providerName;
    this.providerType = spec.providerType;
  }

  validateConfig(): void {
    const missing = this.getMissingEnvVars();
    if (missing.length) {
      throw new ProviderCredentialsMissingError(missing);
    }
  }

  async healthCheck(): Promise<ProviderHealthCheck> {
    this.validateConfig();

    if (!this.spec.baseUrlEnvKey || !this.spec.healthPath) {
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        providerReference: `config_${this.spec.slug}_${randomUUID()}`,
        message:
          'Provider configuration validated; no public health-check endpoint is configured.',
      };
    }

    const startedAt = new Date().toISOString();
    const response = await fetch(this.buildUrl(this.spec.healthPath), {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    const body = await this.safeReadBody(response);

    if (!response.ok) {
      throw new Error(
        `${this.spec.providerName} health check failed with ${response.status}: ${this.pickProviderMessage(body)}`,
      );
    }

    return {
      ok: true,
      checkedAt: startedAt,
      providerReference:
        this.pickProviderReference(body) ??
        `health_${this.spec.slug}_${randomUUID()}`,
      message:
        this.pickProviderMessage(body) ?? 'Provider health check passed.',
    };
  }

  async execute(
    operation: ProviderExecutionOperation,
  ): Promise<ProviderExecutionResult> {
    this.validateConfig();

    if (operation.operationType === 'health_check') {
      const health = await this.healthCheck();
      return {
        provider: this.spec.providerName,
        providerReference: health.providerReference ?? null,
        status: health.ok ? 'COMPLETED' : 'FAILED',
        data: health as unknown as Record<string, unknown>,
      };
    }

    throw new Error(
      `${this.spec.providerName} operation ${operation.operationType} is not implemented in the certification adapter.`,
    );
  }

  verifyWebhook(
    headers: HeaderMap,
    rawBody: Buffer | string,
  ): ProviderWebhookVerification {
    const raw = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : String(rawBody ?? '');
    const verification = this.spec.webhook;

    if (verification.type === 'none') {
      return {
        signatureValid: false,
        failureReason: 'WEBHOOK_NOT_SUPPORTED_FOR_PROVIDER',
      };
    }

    if (verification.type === 'header-secret') {
      const secret = this.getEnv(verification.secretEnvKey);
      const header = this.pickHeader(headers, verification.headerNames);

      if (!secret) {
        return {
          signatureValid: false,
          failureReason: 'PROVIDER_WEBHOOK_SECRET_MISSING',
        };
      }

      if (!header.value) {
        return {
          signatureValid: false,
          failureReason: 'WEBHOOK_SIGNATURE_MISSING',
        };
      }

      return {
        signatureValid: this.safeCompare(header.value, secret),
        signatureHeader: header.name,
        failureReason: this.safeCompare(header.value, secret)
          ? null
          : 'WEBHOOK_SIGNATURE_INVALID',
        idempotencyKey: this.buildWebhookIdempotencyKey(raw),
      };
    }

    if (verification.type === 'hmac') {
      return this.verifyHmacWebhook(raw, headers, verification);
    }

    return this.verifyRsaOrHmacWebhook(raw, headers, verification);
  }

  normalizeStatus(providerStatus: string): string {
    const normalized = String(providerStatus ?? '')
      .trim()
      .toUpperCase();
    if (
      ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'COMPLETE', 'APPROVED'].includes(
        normalized,
      )
    ) {
      return 'COMPLETED';
    }

    if (
      [
        'FAILED',
        'FAILURE',
        'DECLINED',
        'REJECTED',
        'ERROR',
        'CANCELED',
      ].includes(normalized)
    ) {
      return 'FAILED';
    }

    if (['REVERSED', 'REFUNDED'].includes(normalized)) {
      return 'REVERSED';
    }

    if (['REVIEW', 'UNDER_REVIEW', 'PENDING_REVIEW'].includes(normalized)) {
      return 'UNDER_REVIEW';
    }

    return 'PROCESSING';
  }

  normalizeError(error: unknown): NormalizedProviderError {
    const typed = error as { message?: string; code?: string; status?: number };
    const message = typed?.message ?? 'Provider operation failed.';
    const code =
      error instanceof ProviderCredentialsMissingError
        ? 'PROVIDER_CREDENTIALS_MISSING'
        : (typed?.code ?? `PROVIDER_${this.spec.providerName}_ERROR`);

    return {
      code,
      message,
      retryable: !['PROVIDER_CREDENTIALS_MISSING'].includes(code),
      raw: {
        code: typed?.code,
        status: typed?.status,
        message,
      },
    };
  }

  getRequiredEnvVars(): string[] {
    return this.spec.requiredEnvVars;
  }

  getCapabilities(): string[] {
    return this.spec.capabilities;
  }

  supportsSandbox(): boolean {
    return this.spec.supportsSandbox;
  }

  supportsLive(): boolean {
    return this.spec.supportsLive;
  }

  getReadinessState(): ProviderReadinessState {
    if (this.getMode() !== this.spec.liveMode) {
      return ProviderReadinessState.DISABLED;
    }

    return this.getMissingEnvVars().length
      ? ProviderReadinessState.PROVIDER_CREDENTIALS_MISSING
      : ProviderReadinessState.CONFIGURED_NOT_TESTED;
  }

  getSlug(): string {
    return this.spec.slug;
  }

  getLiveMode(): string {
    return this.spec.liveMode;
  }

  getMode(): string {
    return this.getEnv(this.spec.modeEnvKey)?.toLowerCase() || 'mock';
  }

  getMissingEnvVars(): string[] {
    return this.spec.requiredEnvVars.filter((key) => !this.getEnv(key));
  }

  protected buildUrl(path: string) {
    const baseUrl = this.getEnv(this.spec.baseUrlEnvKey ?? '')?.replace(
      /\/$/,
      '',
    );
    if (!baseUrl) {
      throw new ProviderCredentialsMissingError([
        this.spec.baseUrlEnvKey ?? 'PROVIDER_BASE_URL',
      ]);
    }

    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  protected buildHeaders(extra?: Record<string, string>) {
    const apiKey = this.getEnv(this.spec.apiKeyEnvKey ?? '');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(extra ?? {}),
    };

    if (!apiKey) {
      return headers;
    }

    if (this.spec.authScheme === 'basic') {
      headers.Authorization = `Basic ${apiKey}`;
    } else if (this.spec.authScheme === 'key') {
      headers.Authorization = `Key ${apiKey}`;
    } else if (this.spec.authScheme === 'api-key') {
      headers[this.spec.apiKeyHeader ?? 'X-API-Key'] = apiKey;
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
  }

  protected getEnv(key: string) {
    if (!key) {
      return '';
    }

    const value = process.env[key]?.trim() ?? '';
    return value && value.toLowerCase() !== 'value' ? value : '';
  }

  protected async safeReadBody(
    response: Response,
  ): Promise<Record<string, any>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Record<string, any>;
    } catch {
      return { raw: text };
    }
  }

  protected pickProviderReference(body: Record<string, any>) {
    return this.pickFirstString(
      body.id,
      body.reference,
      body.data?.id,
      body.data?.reference,
      body.request_id,
      body.meta?.request_id,
    );
  }

  protected pickProviderMessage(body: Record<string, any>) {
    return this.pickFirstString(
      body.message,
      body.status,
      body.data?.message,
      body.error,
      body.raw,
    );
  }

  private verifyHmacWebhook(
    raw: string,
    headers: HeaderMap,
    verification: Extract<WebhookVerificationSpec, { type: 'hmac' }>,
  ): ProviderWebhookVerification {
    const secret = this.getEnv(verification.secretEnvKey);
    const header = this.pickHeader(headers, verification.headerNames);

    if (!secret) {
      return {
        signatureValid: false,
        failureReason: 'PROVIDER_WEBHOOK_SECRET_MISSING',
      };
    }

    if (!header.value) {
      return {
        signatureValid: false,
        failureReason: 'WEBHOOK_SIGNATURE_MISSING',
      };
    }

    const expected = createHmac(verification.algorithm, secret)
      .update(raw)
      .digest('hex');
    const actual = header.value.replace(verification.signaturePrefix ?? '', '');

    return {
      signatureValid: this.safeCompare(actual, expected),
      signatureHeader: header.name,
      failureReason: this.safeCompare(actual, expected)
        ? null
        : 'WEBHOOK_SIGNATURE_INVALID',
      idempotencyKey: this.buildWebhookIdempotencyKey(raw),
    };
  }

  private verifyRsaOrHmacWebhook(
    raw: string,
    headers: HeaderMap,
    verification: Extract<
      WebhookVerificationSpec,
      { type: 'rsa-sha256-or-hmac' }
    >,
  ): ProviderWebhookVerification {
    const signature = this.pickHeader(headers, verification.headerNames);
    if (!signature.value) {
      return {
        signatureValid: false,
        failureReason: 'WEBHOOK_SIGNATURE_MISSING',
      };
    }

    const publicKey = this.getEnv(verification.publicKeyEnvKey);
    if (publicKey) {
      try {
        const verifier = createVerify('RSA-SHA256');
        verifier.update(raw);
        verifier.end();
        const valid = verifier.verify(publicKey, signature.value, 'base64');

        return {
          signatureValid: valid,
          signatureHeader: signature.name,
          failureReason: valid ? null : 'WEBHOOK_SIGNATURE_INVALID',
          idempotencyKey: this.buildWebhookIdempotencyKey(raw),
        };
      } catch (error) {
        return {
          signatureValid: false,
          signatureHeader: signature.name,
          failureReason: `WEBHOOK_SIGNATURE_INVALID: ${(error as Error).message}`,
        };
      }
    }

    return this.verifyHmacWebhook(raw, headers, {
      type: 'hmac',
      secretEnvKey: verification.hmacSecretEnvKey,
      algorithm: 'sha256',
      headerNames: verification.headerNames,
      signaturePrefix: 'sha256=',
    });
  }

  private pickHeader(headers: HeaderMap, names: string[]) {
    const normalizedHeaders = Object.entries(headers ?? {}).reduce<HeaderMap>(
      (acc, [key, value]) => {
        acc[key.toLowerCase()] = value;
        return acc;
      },
      {},
    );

    for (const name of names) {
      const value = normalizedHeaders[name.toLowerCase()];
      const first = Array.isArray(value) ? value[0] : value;
      if (first) {
        return { name, value: first };
      }
    }

    return { name: null, value: null };
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private buildWebhookIdempotencyKey(raw: string) {
    return `${this.spec.slug}_${createHmac('sha256', this.spec.slug)
      .update(raw)
      .digest('hex')}`;
  }

  private pickFirstString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length) {
        return value.trim();
      }

      if (typeof value === 'number') {
        return String(value);
      }
    }

    return null;
  }
}

export class OneSignalProviderAdapter extends LiveProviderAdapter {
  async healthCheck(): Promise<ProviderHealthCheck> {
    this.validateConfig();

    const appId = process.env.ONESIGNAL_APP_ID?.trim() ?? null;
    const organizationKey = process.env.ONESIGNAL_ORG_API_KEY?.trim();

    if (!organizationKey) {
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        providerReference: appId,
        message:
          'OneSignal app credentials are configured. Add ONESIGNAL_ORG_API_KEY for app lookup or ONESIGNAL_TEST_SUBSCRIPTION_ID for push certification.',
      };
    }

    const response = await fetch(`https://api.onesignal.com/apps/${appId}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Key ${organizationKey}`,
      },
    });
    const body = await this.safeReadBody(response);

    if (!response.ok) {
      throw new Error(
        `OneSignal app lookup failed with ${response.status}: ${this.pickProviderMessage(body)}`,
      );
    }

    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      providerReference: this.pickProviderReference(body) ?? appId ?? null,
      message: 'OneSignal app lookup passed.',
    };
  }

  async execute(
    operation: ProviderExecutionOperation,
  ): Promise<ProviderExecutionResult> {
    if (operation.operationType !== 'send_test_push') {
      return super.execute(operation);
    }

    this.validateConfig();

    const subscriptionId = process.env.ONESIGNAL_TEST_SUBSCRIPTION_ID?.trim();
    if (!subscriptionId) {
      throw new ProviderCredentialsMissingError([
        'ONESIGNAL_TEST_SUBSCRIPTION_ID',
      ]);
    }

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        app_id: process.env.ONESIGNAL_APP_ID,
        include_subscription_ids: [subscriptionId],
        headings: { en: 'Vidal Pay provider certification' },
        contents: { en: 'OneSignal provider certification test.' },
      }),
    });
    const body = await this.safeReadBody(response);

    if (!response.ok) {
      throw new Error(
        `OneSignal test push failed with ${response.status}: ${this.pickProviderMessage(body)}`,
      );
    }

    return {
      provider: KycProvider.ONESIGNAL,
      providerReference: this.pickProviderReference(body),
      status: 'COMPLETED',
      data: body,
      raw: body,
    };
  }
}

export const LIVE_PROVIDER_SPECS: LiveProviderSpec[] = [
  {
    slug: 'flutterwave',
    providerName: KycProvider.FLUTTERWAVE,
    providerType: ProviderType.PAYMENT_NGN,
    modeEnvKey: 'PAYMENT_PROVIDER_MODE',
    liveMode: 'flutterwave',
    requiredEnvVars: [
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
    baseUrlEnvKey: 'FLW_BASE_URL',
    apiKeyEnvKey: 'FLW_SECRET_KEY',
    authScheme: 'bearer',
    healthPath: '/banks/NG',
    webhook: {
      type: 'header-secret',
      secretEnvKey: 'FLW_WEBHOOK_SECRET_HASH',
      headerNames: ['verif-hash'],
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'smileid',
    providerName: KycProvider.SMILE_ID,
    providerType: ProviderType.KYC,
    modeEnvKey: 'KYC_PROVIDER_MODE',
    liveMode: 'smileid',
    requiredEnvVars: [
      'SMILE_ID_BASE_URL',
      'SMILE_ID_PARTNER_ID',
      'SMILE_ID_API_KEY',
      'SMILE_ID_WEBHOOK_SECRET',
    ],
    capabilities: [
      'identity_verification',
      'document_verification',
      'liveness',
      'callback',
      'status_polling',
    ],
    baseUrlEnvKey: 'SMILE_ID_BASE_URL',
    apiKeyEnvKey: 'SMILE_ID_API_KEY',
    authScheme: 'api-key',
    apiKeyHeader: 'X-API-Key',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'SMILE_ID_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: ['x-smile-signature', 'smile-signature', 'x-signature'],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'leadbank',
    providerName: KycProvider.LEAD_BANK,
    providerType: ProviderType.BANKING_USD,
    modeEnvKey: 'USD_PROVIDER_MODE',
    liveMode: 'leadbank',
    requiredEnvVars: [
      'LEAD_BANK_BASE_URL',
      'LEAD_BANK_API_KEY',
      'LEAD_BANK_WEBHOOK_SECRET',
    ],
    capabilities: [
      'usd_account_provisioning',
      'ach_receive',
      'ach_transfer',
      'wire_transfer',
      'webhooks',
    ],
    baseUrlEnvKey: 'LEAD_BANK_BASE_URL',
    apiKeyEnvKey: 'LEAD_BANK_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'LEAD_BANK_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: ['x-lead-signature', 'x-webhook-signature', 'x-signature'],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'verto',
    providerName: KycProvider.VERTO,
    providerType: ProviderType.FX,
    modeEnvKey: 'FX_PROVIDER_MODE',
    liveMode: 'verto',
    requiredEnvVars: [
      'VERTO_BASE_URL',
      'VERTO_API_KEY',
      'VERTO_WEBHOOK_SECRET',
    ],
    capabilities: ['fx_quote', 'fx_conversion', 'status_polling', 'webhooks'],
    baseUrlEnvKey: 'VERTO_BASE_URL',
    apiKeyEnvKey: 'VERTO_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'VERTO_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: ['x-verto-signature', 'x-webhook-signature', 'x-signature'],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'zerohash',
    providerName: KycProvider.ZERO_HASH,
    providerType: ProviderType.CRYPTO,
    modeEnvKey: 'CRYPTO_PROVIDER_MODE',
    liveMode: 'zerohash',
    requiredEnvVars: [
      'ZERO_HASH_BASE_URL',
      'ZERO_HASH_API_KEY',
      'ZERO_HASH_WEBHOOK_SECRET',
    ],
    capabilities: ['assets', 'quote', 'trade', 'transactions', 'webhooks'],
    baseUrlEnvKey: 'ZERO_HASH_BASE_URL',
    apiKeyEnvKey: 'ZERO_HASH_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'rsa-sha256-or-hmac',
      publicKeyEnvKey: 'ZERO_HASH_WEBHOOK_PUBLIC_KEY',
      hmacSecretEnvKey: 'ZERO_HASH_WEBHOOK_SECRET',
      headerNames: [
        'x-zh-signature',
        'zero-hash-signature',
        'x-webhook-signature',
        'x-signature',
      ],
      timestampHeaderNames: ['x-zh-timestamp', 'zero-hash-timestamp'],
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'cowrywise',
    providerName: KycProvider.COWRYWISE,
    providerType: ProviderType.INVESTMENT,
    modeEnvKey: 'INVESTMENT_PROVIDER_MODE',
    liveMode: 'cowrywise',
    requiredEnvVars: [
      'COWRYWISE_BASE_URL',
      'COWRYWISE_API_KEY',
      'COWRYWISE_WEBHOOK_SECRET',
    ],
    capabilities: ['products', 'portfolio', 'orders', 'webhooks'],
    baseUrlEnvKey: 'COWRYWISE_BASE_URL',
    apiKeyEnvKey: 'COWRYWISE_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'COWRYWISE_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: [
        'x-cowrywise-signature',
        'x-webhook-signature',
        'x-signature',
      ],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'april',
    providerName: KycProvider.APRIL,
    providerType: ProviderType.TAX,
    modeEnvKey: 'TAX_PROVIDER_MODE',
    liveMode: 'april',
    requiredEnvVars: [
      'APRIL_BASE_URL',
      'APRIL_API_KEY',
      'APRIL_WEBHOOK_SECRET',
    ],
    capabilities: [
      'tax_status',
      'filing_start',
      'documents',
      'submit',
      'webhooks',
    ],
    baseUrlEnvKey: 'APRIL_BASE_URL',
    apiKeyEnvKey: 'APRIL_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'APRIL_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: ['x-april-signature', 'x-webhook-signature', 'x-signature'],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'column',
    providerName: KycProvider.COLUMN,
    providerType: ProviderType.TAX,
    modeEnvKey: 'TAX_PROVIDER_MODE',
    liveMode: 'column',
    requiredEnvVars: [
      'COLUMN_BASE_URL',
      'COLUMN_API_KEY',
      'COLUMN_WEBHOOK_SECRET',
    ],
    capabilities: [
      'tax_status',
      'filing_start',
      'documents',
      'submit',
      'webhooks',
    ],
    baseUrlEnvKey: 'COLUMN_BASE_URL',
    apiKeyEnvKey: 'COLUMN_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'COLUMN_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: ['x-column-signature', 'x-webhook-signature', 'x-signature'],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'onesignal',
    providerName: KycProvider.ONESIGNAL,
    providerType: ProviderType.NOTIFICATION,
    modeEnvKey: 'NOTIFICATION_PROVIDER_MODE',
    liveMode: 'onesignal',
    requiredEnvVars: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'],
    capabilities: ['device_registration', 'push_delivery', 'templates'],
    apiKeyEnvKey: 'ONESIGNAL_REST_API_KEY',
    authScheme: 'key',
    webhook: { type: 'none' },
    supportsSandbox: true,
    supportsLive: true,
  },
  {
    slug: 'sardine',
    providerName: KycProvider.SARDINE,
    providerType: ProviderType.FRAUD,
    modeEnvKey: 'FRAUD_PROVIDER_MODE',
    liveMode: 'sardine',
    requiredEnvVars: [
      'SARDINE_BASE_URL',
      'SARDINE_API_KEY',
      'SARDINE_WEBHOOK_SECRET',
    ],
    capabilities: ['risk_evaluation', 'aml_screening', 'webhooks'],
    baseUrlEnvKey: 'SARDINE_BASE_URL',
    apiKeyEnvKey: 'SARDINE_API_KEY',
    authScheme: 'bearer',
    healthPath: '/health',
    webhook: {
      type: 'hmac',
      secretEnvKey: 'SARDINE_WEBHOOK_SECRET',
      algorithm: 'sha256',
      headerNames: [
        'x-sardine-signature',
        'x-webhook-signature',
        'x-signature',
      ],
      signaturePrefix: 'sha256=',
    },
    supportsSandbox: true,
    supportsLive: true,
  },
];

export function createLiveProviderAdapters(): LiveProviderAdapter[] {
  return LIVE_PROVIDER_SPECS.map((spec) =>
    spec.providerName === KycProvider.ONESIGNAL
      ? new OneSignalProviderAdapter(spec)
      : new LiveProviderAdapter(spec),
  );
}

export function getLiveProviderAdapterBySlug(slug: string) {
  return createLiveProviderAdapters().find(
    (adapter) => adapter.getSlug() === slug.toLowerCase(),
  );
}

export function getLiveProviderAdapterByName(provider: KycProvider) {
  return createLiveProviderAdapters().find(
    (adapter) => adapter.providerName === provider,
  );
}
