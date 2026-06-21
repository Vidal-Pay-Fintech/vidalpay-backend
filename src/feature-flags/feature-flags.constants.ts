export const FEATURE_FLAGS = [
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
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];

export const DEMO_FEATURE_KEY = 'demoFeature';

export const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagKey, string> = {
  ENABLE_DEMO_MODE: 'Enables sandbox-only demo APIs and mock provider flows.',
  ENABLE_NGN_WALLET: 'Enables NGN wallet ledgers and actions.',
  ENABLE_USD_WALLET: 'Enables USD wallet ledgers and actions.',
  ENABLE_INTERNAL_TRANSFER: 'Enables internal Vidal Pay tag transfers.',
  ENABLE_NGN_BANK_TRANSFER: 'Enables NGN external bank transfer rails.',
  ENABLE_USD_BANK_TRANSFER: 'Enables USD external bank transfer rails.',
  ENABLE_FX_CONVERSION_DEMO: 'Enables demo FX quote and conversion APIs.',
  ENABLE_VIRTUAL_CARD_DEMO: 'Enables virtual card demo ledgers and funding.',
  ENABLE_CRYPTO_DEMO: 'Enables crypto demo surfaces.',
  ENABLE_INVESTMENT_DEMO: 'Enables investment demo surfaces.',
  ENABLE_TAX_DEMO: 'Enables tax demo surfaces.',
  ENABLE_PROVIDER_PENDING_STATES: 'Allows mock providers to return pending states.',
};
