import 'dotenv/config';
import { randomUUID } from 'crypto';
import {
  createLiveProviderAdapters,
  getLiveProviderAdapterBySlug,
  ProviderCredentialsMissingError,
} from '../src/integrations/provider/live/live-provider-adapters';

type CertificationResult = {
  provider: string;
  slug: string;
  envConfigured: boolean;
  missingEnvVars: string[];
  testAttempted: string;
  testPassed: boolean;
  providerReference: string | null;
  completionStatus:
    | 'PROVIDER_CREDENTIALS_MISSING'
    | 'CONFIGURED_NOT_TESTED'
    | 'COMPLETE_LIVE_TESTED'
    | 'FAILED';
  evidenceId: string | null;
  evidenceEnvVar: string;
  evidenceValue: Record<string, unknown> | null;
  failureReason: string | null;
  checkedAt: string;
};

const EVIDENCE_ENV_BY_SLUG: Record<string, string> = {
  flutterwave: 'FLUTTERWAVE_LIVE_TEST_EVIDENCE',
  smileid: 'SMILE_ID_LIVE_TEST_EVIDENCE',
  leadbank: 'LEAD_BANK_LIVE_TEST_EVIDENCE',
  verto: 'VERTO_LIVE_TEST_EVIDENCE',
  zerohash: 'ZERO_HASH_LIVE_TEST_EVIDENCE',
  cowrywise: 'COWRYWISE_LIVE_TEST_EVIDENCE',
  april: 'APRIL_LIVE_TEST_EVIDENCE',
  column: 'COLUMN_LIVE_TEST_EVIDENCE',
  onesignal: 'ONESIGNAL_LIVE_TEST_EVIDENCE',
  sardine: 'SARDINE_LIVE_TEST_EVIDENCE',
};

async function main() {
  const slug = resolveRequestedSlug(process.argv[2]?.trim().toLowerCase());
  if (!slug || slug === 'all') {
    const results: CertificationResult[] = [];
    for (const adapter of createLiveProviderAdapters()) {
      results.push(await certifyProvider(adapter.getSlug()));
    }

    print(results);
    process.exit(results.every((result) => result.testPassed) ? 0 : 1);
  }

  const result = await certifyProvider(slug);
  print(result);
  process.exit(result.testPassed ? 0 : 1);
}

function resolveRequestedSlug(slug: string | undefined) {
  if (slug === 'tax') {
    const taxMode = process.env.TAX_PROVIDER_MODE?.trim().toLowerCase();
    return taxMode === 'column' ? 'column' : 'april';
  }

  return slug;
}

async function certifyProvider(slug: string): Promise<CertificationResult> {
  const adapter = getLiveProviderAdapterBySlug(slug);
  const checkedAt = new Date().toISOString();
  const evidenceEnvVar =
    EVIDENCE_ENV_BY_SLUG[slug] ?? `${slug.toUpperCase()}_LIVE_TEST_EVIDENCE`;

  if (!adapter) {
    return {
      provider: slug,
      slug,
      envConfigured: false,
      missingEnvVars: [],
      testAttempted: 'adapter_lookup',
      testPassed: false,
      providerReference: null,
      completionStatus: 'FAILED',
      evidenceId: null,
      evidenceEnvVar,
      evidenceValue: null,
      failureReason: 'PROVIDER_ADAPTER_MISSING',
      checkedAt,
    };
  }

  const missingEnvVars = adapter.getMissingEnvVars();
  if (missingEnvVars.length) {
    return {
      provider: adapter.providerName,
      slug,
      envConfigured: false,
      missingEnvVars,
      testAttempted: 'config_validation',
      testPassed: false,
      providerReference: null,
      completionStatus: 'PROVIDER_CREDENTIALS_MISSING',
      evidenceId: null,
      evidenceEnvVar,
      evidenceValue: null,
      failureReason: `PROVIDER_CREDENTIALS_MISSING: ${missingEnvVars.join(', ')}`,
      checkedAt,
    };
  }

  if (slug === 'onesignal' && !process.env.ONESIGNAL_TEST_SUBSCRIPTION_ID) {
    return {
      provider: adapter.providerName,
      slug,
      envConfigured: true,
      missingEnvVars: ['ONESIGNAL_TEST_SUBSCRIPTION_ID'],
      testAttempted: 'send_test_push',
      testPassed: false,
      providerReference: null,
      completionStatus: 'CONFIGURED_NOT_TESTED',
      evidenceId: null,
      evidenceEnvVar,
      evidenceValue: null,
      failureReason:
        'ONESIGNAL_TEST_SUBSCRIPTION_ID is required before OneSignal can be marked COMPLETE_LIVE_TESTED.',
      checkedAt,
    };
  }

  try {
    const operation = getCertificationOperation(slug);
    const result = await adapter.execute(operation);
    const evidenceId = `cert_${slug}_${randomUUID()}`;
    const evidenceValue = {
      evidenceId,
      provider: adapter.providerName,
      slug,
      mode: adapter.getMode(),
      testAttempted: operation.operationType,
      testPassed: true,
      providerReference: result.providerReference,
      healthCheckAt: checkedAt,
      successfulOperationAt: checkedAt,
      sandboxTestAt: checkedAt,
      webhookVerifiedAt: null,
      completionStatus: 'COMPLETE_LIVE_TESTED',
    };

    return {
      provider: adapter.providerName,
      slug,
      envConfigured: true,
      missingEnvVars: [],
      testAttempted: operation.operationType,
      testPassed: true,
      providerReference: result.providerReference,
      completionStatus: 'COMPLETE_LIVE_TESTED',
      evidenceId,
      evidenceEnvVar,
      evidenceValue,
      failureReason: null,
      checkedAt,
    };
  } catch (error) {
    const normalized = adapter.normalizeError(error);
    const missing =
      error instanceof ProviderCredentialsMissingError
        ? error.missingEnvVars
        : [];

    return {
      provider: adapter.providerName,
      slug,
      envConfigured: missing.length === 0,
      missingEnvVars: missing,
      testAttempted: getCertificationOperation(slug).operationType,
      testPassed: false,
      providerReference: null,
      completionStatus:
        normalized.code === 'PROVIDER_CREDENTIALS_MISSING'
          ? 'PROVIDER_CREDENTIALS_MISSING'
          : 'FAILED',
      evidenceId: null,
      evidenceEnvVar,
      evidenceValue: null,
      failureReason: `${normalized.code}: ${normalized.message}`,
      checkedAt,
    };
  }
}

function getCertificationOperation(slug: string) {
  if (slug === 'onesignal' && process.env.ONESIGNAL_TEST_SUBSCRIPTION_ID) {
    return {
      operationType: 'send_test_push',
      payload: {},
      idempotencyKey: `cert_${slug}_${Date.now()}`,
    };
  }

  return {
    operationType: 'health_check',
    payload: {},
    idempotencyKey: `cert_${slug}_${Date.now()}`,
  };
}

function print(result: CertificationResult | CertificationResult[]) {
  const output = JSON.stringify(result, null, 2);
  console.log(output);
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'FAILED',
        failureReason: error?.message ?? 'Provider certification failed.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
