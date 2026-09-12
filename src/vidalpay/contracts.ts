export type BlockedResponse = {
  code: string;
  message: string;
  feature: string;
  capability: string;
  reason: string;
  missingRequirements: string[];
  provider: string | null;
  retryable: boolean;
};

export type ProviderStatusItem = {
  provider: string;
  providerType: string;
  capability: string;
  enabled: boolean;
  envConfigured: boolean;
  liveTested: boolean;
  status: string;
  readinessStatus: string;
  missingEnvVars: string[];
  failureReason: string | null;
  service: string;
  capabilities: string[];
  mode: string;
};

export const createBlockedResponse = (input: {
  code?: string;
  message?: string;
  feature: string;
  capability: string;
  reason: string;
  missingRequirements?: string[];
  provider?: string | null;
  retryable?: boolean;
}): BlockedResponse => ({
  code: input.code ?? 'FEATURE_UNAVAILABLE',
  message:
    input.message ??
    `${input.feature} is not available from the configured backend provider.`,
  feature: input.feature,
  capability: input.capability,
  reason: input.reason,
  missingRequirements: input.missingRequirements ?? [],
  provider: input.provider ?? null,
  retryable: input.retryable ?? false,
});

export const REQUIRED_PROVIDER_CAPABILITIES = [
  'usd_wallet',
  'ngn_wallet',
  'usd_account_details',
  'ngn_account_details',
  'usd_virtual_card',
  'usd_physical_card',
  'ngn_virtual_card',
  'ngn_physical_card',
  'card_topup',
  'card_freeze',
  'card_unfreeze',
  'card_terminate',
  'card_limits',
  'airtime_catalog',
  'airtime_purchase',
  'data_catalog',
  'data_purchase',
  'utilities_catalog',
  'utilities_validate',
  'utilities_payment',
  'fx_quote',
  'fx_convert',
  'bank_transfer',
  'tag_transfer',
  'crypto_overview',
  'crypto_assets',
  'crypto_deposit',
  'crypto_withdrawal',
  'investments_account',
  'investments_products',
  'investments_orders',
  'usd_loans',
  'usd_loan_eligibility',
  'usd_loan_application',
  'usd_loan_repayment',
  'notifications',
  'support_tickets',
  'disputes',
  'tax',
  'rewards',
  'referrals',
  'qr_payments',
  'money_requests',
] as const;

export type ProviderCapability = (typeof REQUIRED_PROVIDER_CAPABILITIES)[number];
