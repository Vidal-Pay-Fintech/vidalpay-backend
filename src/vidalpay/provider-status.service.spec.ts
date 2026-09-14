import { ConfigService } from '@nestjs/config';
import { ProviderStatusService } from './provider-status.service';
import { REQUIRED_PROVIDER_CAPABILITIES } from './contracts';

describe('ProviderStatusService', () => {
  const buildService = (env: Record<string, string | undefined> = {}) =>
    new ProviderStatusService({
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService);

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

  it('does not treat placeholder credentials or malformed base URLs as configured', () => {
    const service = buildService({
      UNIT_API_TOKEN: 'your_sandbox_token',
      VERTO_API_KEY: 'sandbox-key',
      VERTO_BASE_URL: 'not-a-url',
    });
    expect(service.getStatus('usd_wallet').enabled).toBe(false);
    expect(service.getStatus('fx_quote')).toEqual(
      expect.objectContaining({
        enabled: false,
        missingEnvVars: expect.arrayContaining([
          'FX_PROVIDER_BASE_URL + FX_PROVIDER_API_KEY',
          'VERTO_BASE_URL + VERTO_API_KEY',
        ]),
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
      expect.objectContaining({
        provider: 'Sudo',
        enabled: false,
        readinessStatus: 'MISSING_CREDENTIALS',
        missingEnvVars: ['SUDO_API_KEY', 'SUDO_CARD_PROGRAM_ID'],
      }),
    );
    expect(service.getStatus('crypto_overview')).toEqual(
      expect.objectContaining({
        enabled: false,
        missingEnvVars: ['ZERO_HASH_API_KEY'],
      }),
    );
  });

  it('uses Reloadly as a configured bill-service fallback', () => {
    const service = buildService({
      RELOADLY_CLIENT_ID: 'sandbox-client',
      RELOADLY_CLIENT_SECRET: 'sandbox-secret',
    });

    expect(service.getStatus('airtime_purchase')).toEqual(
      expect.objectContaining({
        enabled: true,
        provider: 'PayVessel/Reloadly',
        readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
      }),
    );
  });

  it('keeps loan and tax mutations unsupported despite stray credentials', () => {
    const service = buildService({
      UNIT_API_TOKEN: 'sandbox-token',
      APRIL_API_KEY: 'unverified-key',
    });
    expect(service.getStatus('usd_loan_application').readinessStatus).toBe(
      'UNSUPPORTED',
    );
    expect(service.getStatus('tax').readinessStatus).toBe('UNSUPPORTED');
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
