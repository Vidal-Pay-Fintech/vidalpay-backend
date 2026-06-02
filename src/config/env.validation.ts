type EnvType = 'string' | 'number' | 'boolean' | 'enum';

interface EnvSchemaEntry {
  type: EnvType;
  required?: boolean;
  default?: string;
  values?: string[];
}

const providerModes = {
  PAYMENT_PROVIDER_MODE: ['mock', 'flutterwave'],
  USD_PROVIDER_MODE: ['mock', 'leadbank'],
  FX_PROVIDER_MODE: ['mock', 'verto'],
  KYC_PROVIDER_MODE: ['mock', 'smileid'],
  CRYPTO_PROVIDER_MODE: ['mock', 'zerohash'],
  INVESTMENT_PROVIDER_MODE: ['mock', 'cowrywise'],
  TAX_PROVIDER_MODE: ['mock', 'april', 'column'],
  NOTIFICATION_PROVIDER_MODE: ['mock', 'onesignal'],
  FRAUD_PROVIDER_MODE: ['mock', 'sardine'],
};

const featureFlags = [
  'ENABLE_DEMO_MODE',
  'ENABLE_NGN_WALLET',
  'ENABLE_USD_WALLET',
  'ENABLE_INTERNAL_TRANSFER',
  'ENABLE_NGN_BANK_TRANSFER',
  'ENABLE_USD_BANK_TRANSFER',
  'ENABLE_FX_CONVERSION_DEMO',
  'ENABLE_VIRTUAL_CARD_DEMO',
  'ENABLE_CRYPTO_DEMO',
  'ENABLE_INVESTMENT_DEMO',
  'ENABLE_TAX_DEMO',
  'ENABLE_PROVIDER_PENDING_STATES',
];

const schema: Record<string, EnvSchemaEntry> = {
  NODE_ENV: {
    type: 'enum',
    values: ['development', 'test', 'staging', 'production'],
    default: 'development',
  },
  PORT: { type: 'number', default: '3000' },
  MYSQL_HOST: { type: 'string', required: true },
  MYSQL_PORT: { type: 'number', required: true },
  MYSQL_DATABASE: { type: 'string', required: true },
  MYSQL_USERNAME: { type: 'string', required: true },
  MYSQL_PASSWORD: { type: 'string', required: true },
  JWT_SECRET: { type: 'string', required: true },
  JWT_TOKEN_AUDIENCE: { type: 'string', required: true },
  JWT_TOKEN_ISSUER: { type: 'string', required: true },
  JWT_ACCESS_TOKEN_TTL: { type: 'string', default: '3600s' },
  JWT_REFRESH_TOKEN_TTL: { type: 'string', default: '7d' },
  PRODUCT_NAME: { type: 'string', required: true },
  APP_NAME: { type: 'string', required: true },
  APP_URL: { type: 'string', required: true },
  ADMIN_DASHBOARD_URL: { type: 'string', required: true },
  PAYMENT_REDIRECT_URL: { type: 'string', required: true },
  FROM_EMAIL: { type: 'string', required: true },
  SUPPORT_EMAIL: { type: 'string', required: true },
  SUPPORT_PHONE: { type: 'string', required: true },
  ENCRYPT_KEY: { type: 'string', required: true },
  CODE_EXPIRATION_MINUTES: { type: 'number', default: '30' },
  PERMITTED_CHARACTERS: {
    type: 'string',
    default: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  },
  ENABLE_SWAGGER: { type: 'boolean', default: 'false' },
  ALLOW_STAGING_KYC_OVERRIDE: { type: 'boolean', default: 'false' },
  BUILD_TIMESTAMP: { type: 'string', default: new Date().toISOString() },
  COMMIT_SHA: { type: 'string', default: '' },
  RENDER_GIT_COMMIT: { type: 'string', default: '' },
  BACKEND_PUBLIC_URL: { type: 'string', default: '' },
  API_BASE_URL: { type: 'string', default: '' },
  RESEND_API_KEY: { type: 'string', default: '' },
  RESEND_FROM_EMAIL: { type: 'string', default: '' },
  RESEND_FROM_NAME: { type: 'string', default: '' },
  TWILIO_ACCOUNT_SID: { type: 'string', default: '' },
  TWILIO_AUTH_TOKEN: { type: 'string', default: '' },
  TWILIO_PHONE_NUMBER: { type: 'string', default: '' },
  TWILIO_SMS_SENDER_ID: { type: 'string', default: '' },
  FLW_BASE_URL: { type: 'string', default: '' },
  FLW_SECRET_KEY: { type: 'string', default: '' },
  FLW_WEBHOOK_SECRET_HASH: { type: 'string', default: '' },
  LEAD_BANK_API_KEY: { type: 'string', default: '' },
  SMILE_ID_API_KEY: { type: 'string', default: '' },
  VERTO_API_KEY: { type: 'string', default: '' },
  ZERO_HASH_API_KEY: { type: 'string', default: '' },
  COWRYWISE_API_KEY: { type: 'string', default: '' },
  APRIL_API_KEY: { type: 'string', default: '' },
  COLUMN_API_KEY: { type: 'string', default: '' },
  ONESIGNAL_APP_ID: { type: 'string', default: '' },
  SARDINE_API_KEY: { type: 'string', default: '' },
  FRONTEND_URL: { type: 'string', default: '' },
  SLACK_API_TOKEN: { type: 'string', default: '' },
  SLACK_API_CHANNEL: { type: 'string', default: '#api' },
  SLACK_BOT_NAME: { type: 'string', default: 'Vidal Pay API Error Tracker' },
  SLACK_BOT_ICON: { type: 'string', default: ':warning:' },
  SLACK_API_URL: { type: 'string', default: 'https://slack.com/api/chat.postMessage' },
};

for (const [key, values] of Object.entries(providerModes)) {
  schema[key] = {
    type: 'enum',
    values,
    default: 'mock',
  };
}

for (const flag of featureFlags) {
  schema[flag] = {
    type: 'boolean',
    default:
      flag === 'ENABLE_PROVIDER_PENDING_STATES' ||
      flag === 'ENABLE_CRYPTO_DEMO' ||
      flag === 'ENABLE_INVESTMENT_DEMO' ||
      flag === 'ENABLE_TAX_DEMO'
        ? 'false'
        : 'true',
  };
}

export function validateEnvironment(config: Record<string, unknown>) {
  const errors: string[] = [];
  const validated: Record<string, string> = {};

  for (const [key, entry] of Object.entries(schema)) {
    const rawValue =
      normalizeValue(config[key]) ??
      normalizeValue(process.env[key]) ??
      entry.default ??
      '';

    if (entry.required && !rawValue) {
      errors.push(`${key} is required`);
      continue;
    }

    if (rawValue) {
      validateType(key, rawValue, entry, errors);
    }

    validated[key] = rawValue;
    process.env[key] = rawValue;
  }

  if (errors.length) {
    throw new Error(`Environment validation failed: ${errors.join('; ')}`);
  }

  return {
    ...config,
    ...validated,
  };
}

function normalizeValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function validateType(
  key: string,
  value: string,
  entry: EnvSchemaEntry,
  errors: string[],
) {
  if (entry.type === 'number' && Number.isNaN(Number(value))) {
    errors.push(`${key} must be a number`);
  }

  if (entry.type === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) {
    errors.push(`${key} must be true or false`);
  }

  if (entry.type === 'enum' && entry.values && !entry.values.includes(value)) {
    errors.push(`${key} must be one of: ${entry.values.join(', ')}`);
  }
}
