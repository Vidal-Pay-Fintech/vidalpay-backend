import { validateEnvironment } from './env.validation';

describe('production environment safety validation', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  const requiredProductionConfig = () => ({
    NODE_ENV: 'production',
    MYSQL_HOST: 'database.example.com',
    MYSQL_PORT: '3306',
    MYSQL_DATABASE: 'vidalpay',
    MYSQL_USERNAME: 'vidalpay',
    MYSQL_PASSWORD: 'secret',
    JWT_SECRET: 'jwt-secret',
    JWT_TOKEN_AUDIENCE: 'vidalpay-client',
    JWT_TOKEN_ISSUER: 'vidalpay-api',
    PRODUCT_NAME: 'Vidal Pay',
    APP_NAME: 'Vidal Pay',
    APP_URL: 'https://app.example.com',
    ADMIN_DASHBOARD_URL: 'https://admin.example.com',
    PAYMENT_REDIRECT_URL: 'https://app.example.com/payments/callback',
    FROM_EMAIL: 'support@example.com',
    SUPPORT_EMAIL: 'support@example.com',
    SUPPORT_PHONE: '+2348000000000',
    ENCRYPT_KEY: 'encryption-key',
  });

  it('defaults every demo capability to disabled', () => {
    const result = validateEnvironment(requiredProductionConfig());

    expect(result.ENABLE_DEMO_MODE).toBe('false');
    expect(result.ENABLE_FX_CONVERSION_DEMO).toBe('false');
    expect(result.ENABLE_VIRTUAL_CARD_DEMO).toBe('false');
    expect(result.ENABLE_CRYPTO_DEMO).toBe('false');
  });

  it('rejects explicitly enabled demo capabilities in production', () => {
    expect(() =>
      validateEnvironment({
        ...requiredProductionConfig(),
        ENABLE_DEMO_MODE: 'true',
      }),
    ).toThrow('ENABLE_DEMO_MODE cannot be enabled in production');
  });

  it('rejects external bank transfers backed by a mock provider', () => {
    expect(() =>
      validateEnvironment({
        ...requiredProductionConfig(),
        ENABLE_NGN_BANK_TRANSFER: 'true',
        PAYMENT_PROVIDER_MODE: 'mock',
      }),
    ).toThrow(
      'ENABLE_NGN_BANK_TRANSFER requires a live PAYMENT_PROVIDER_MODE in production',
    );
  });

  it('rejects an enabled push worker without a live OneSignal provider', () => {
    expect(() =>
      validateEnvironment({
        ...requiredProductionConfig(),
        PUSH_NOTIFICATION_WORKER_ENABLED: 'true',
        NOTIFICATION_PROVIDER_MODE: 'mock',
      }),
    ).toThrow(
      'PUSH_NOTIFICATION_WORKER_ENABLED requires NOTIFICATION_PROVIDER_MODE=onesignal',
    );
  });
});
