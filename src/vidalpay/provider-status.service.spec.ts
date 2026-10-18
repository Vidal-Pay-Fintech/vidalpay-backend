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

  it('marks Fincra USD wallet capability unavailable when backend credentials are missing', () => {
    const service = buildService();

    expect(service.getStatus('usd_wallet')).toEqual(
      expect.objectContaining({
        provider: 'Fincra',
        enabled: false,
        readinessStatus: 'MISSING_CREDENTIALS',
        missingEnvVars: ['FINCRA_API_KEY'],
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
        missingEnvVars: ['FINCRA_API_KEY'],
      }),
    );
  });

  it('uses the same Fincra environment validation as the HTTP client', () => {
    expect(buildService({ FINCRA_API_KEY: 'key' }).getStatus('fx_quote')).toEqual(
      expect.objectContaining({ enabled: true, mode: 'sandbox', liveTested: false }),
    );
    expect(buildService({ FINCRA_API_KEY: 'key', FINCRA_ENV: 'live' }).getStatus('wallet_activation')).toEqual(
      expect.objectContaining({ enabled: true, mode: 'live', liveTested: false }),
    );
    expect(buildService({ FINCRA_API_KEY: 'key', FINCRA_BASE_URL: 'https://api.fincra.com' }).getStatus('wallet_activation')).toEqual(
      expect.objectContaining({ enabled: false, envConfigured: false, readinessStatus: 'INVALID_CONFIGURATION' }),
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

  it('keeps Fincra payout execution blocked until its payout flow is implemented', () => {
    const service = buildService({ FINCRA_API_KEY: 'sandbox-key' });

    expect(service.getStatus('bank_transfer')).toEqual(
      expect.objectContaining({
        provider: 'Fincra',
        enabled: false,
        envConfigured: true,
        missingEnvVars: [],
        readinessStatus: 'UNSUPPORTED',
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
        provider: 'Yellow Card',
        missingEnvVars: ['YELLOWCARD_BASE_URL', 'YELLOWCARD_API_KEY'],
      }),
    );
  });

  it('marks Yellow Card crypto readiness configured from sandbox env values', () => {
    const service = buildService({
      YELLOWCARD_BASE_URL: 'https://sandbox.api.yellowcard.io',
      YELLOWCARD_API_KEY: 'yellowcard-api-key',
    });

    expect(service.getStatus('crypto_quote')).toEqual(
      expect.objectContaining({
        provider: 'Yellow Card',
        enabled: true,
        envConfigured: true,
        readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
        missingEnvVars: [],
      }),
    );
  });

  it('enables VTU purchase readiness only when the VTU provider credentials are configured', () => {
    const service = buildService({
      VTU_PROVIDER: 'VTU.ng',
      VTU_BASE_URL: 'https://vtu.ng/wp-json',
      VTU_USERNAME: 'sandbox-user',
      VTU_PASSWORD: 'sandbox-password',
    });

    expect(service.getStatus('airtime_purchase')).toEqual(
      expect.objectContaining({
        enabled: true,
        provider: 'VTU.ng',
        readinessStatus: 'CONFIGURED_NOT_LIVE_TESTED',
      }),
    );
  });

  it('does not enable bill purchases from read-only Reloadly catalog credentials', () => {
    const service = buildService({
      RELOADLY_CLIENT_ID: 'sandbox-client',
      RELOADLY_CLIENT_SECRET: 'sandbox-secret',
    });

    expect(service.getStatus('airtime_catalog').enabled).toBe(true);
    expect(service.getStatus('airtime_purchase')).toEqual(
      expect.objectContaining({
        enabled: false,
        provider: 'VTU.ng',
        readinessStatus: 'MISSING_CREDENTIALS',
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
