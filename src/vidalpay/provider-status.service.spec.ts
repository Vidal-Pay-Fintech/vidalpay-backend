import { ConfigService } from '@nestjs/config';
import { ProviderStatusService } from './provider-status.service';
import { REQUIRED_PROVIDER_CAPABILITIES } from './contracts';

describe('ProviderStatusService', () => {
  const buildService = (env: Record<string, string | undefined> = {}) =>
    new ProviderStatusService({ get: jest.fn((key: string) => env[key]) } as unknown as ConfigService);

  it('reports every required mobile-visible capability', () => {
    const service = buildService();
    const capabilities = service.getStatuses().map((item) => item.capability);

    expect(capabilities).toEqual(REQUIRED_PROVIDER_CAPABILITIES);
  });

  it('marks Unit-backed USD wallet capability unavailable when backend credentials are missing', () => {
    const service = buildService();

    expect(service.getStatus('usd_wallet')).toEqual(
      expect.objectContaining({
        provider: 'Unit.co',
        enabled: false,
        readinessStatus: 'MISSING_CREDENTIALS',
        missingEnvVars: ['UNIT_API_TOKEN'],
      }),
    );
  });

  it('marks internal tag transfers ready without exposing provider credentials', () => {
    const service = buildService();

    expect(service.getStatus('tag_transfer')).toEqual(
      expect.objectContaining({
        provider: 'VidalPay',
        enabled: true,
        liveTested: true,
        missingEnvVars: [],
      }),
    );
  });

  it('accepts either configured currency rail for the shared bank-transfer capability', () => {
    const payVesselService = buildService({
      PAYVESSEL_API_KEY: 'sandbox-key',
      PAYVESSEL_API_SECRET: 'sandbox-secret',
    });

    expect(payVesselService.getStatus('bank_transfer')).toEqual(
      expect.objectContaining({
        enabled: true,
        envConfigured: true,
        missingEnvVars: [],
        readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
      }),
    );
  });

  it('does not mark unsupported or unimplemented product areas as available', () => {
    const service = buildService();

    expect(service.getStatus('ngn_physical_card')).toEqual(
      expect.objectContaining({ enabled: false, readinessStatus: 'UNSUPPORTED' }),
    );
    expect(service.getStatus('crypto_overview')).toEqual(
      expect.objectContaining({ enabled: false, missingEnvVars: ['CRYPTO_PROVIDER', 'CRYPTO_PROVIDER_API_KEY'] }),
    );
  });

  it('marks internal rewards and referrals ledgers ready without mobile secrets', () => {
    const service = buildService();

    expect(service.getStatus('rewards')).toEqual(
      expect.objectContaining({
        provider: 'VidalPay',
        enabled: true,
        readinessStatus: 'READY',
        missingEnvVars: [],
      }),
    );
    expect(service.getStatus('referrals')).toEqual(
      expect.objectContaining({
        provider: 'VidalPay',
        enabled: true,
        readinessStatus: 'READY',
        missingEnvVars: [],
      }),
    );
  });
});
