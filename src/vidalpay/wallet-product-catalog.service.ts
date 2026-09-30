import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createBlockedResponse } from './contracts';
import { AccountJurisdiction } from './jurisdiction.service';

export type WalletProductKind = 'VIRTUAL_ACCOUNT' | 'WALLET_ACCOUNT';
export type WalletProductTier = 'PRIMARY' | 'ADDITIONAL';
export type WalletRequirementKey =
  | 'legal_name'
  | 'date_of_birth'
  | 'address'
  | 'government_id'
  | 'proof_of_address'
  | string;

export type WalletProductRequirement = {
  key: WalletRequirementKey;
  label: string;
  source: 'VIDALPAY_PROFILE' | 'METAMAP' | 'FINCRA' | 'MANUAL';
  providerReference?: string | null;
};

export type WalletProduct = {
  currency: string;
  provider: 'FINCRA';
  enabled: boolean;
  accountType: WalletProductKind;
  tier: WalletProductTier;
  supportedJurisdictions: AccountJurisdiction[];
  canProvision: boolean;
  requirementsConfigured: boolean;
  requirements: WalletProductRequirement[];
  providerProductId: string | null;
  providerMetadata: Record<string, unknown>;
};

@Injectable()
export class WalletProductCatalogService {
  constructor(private readonly configService: ConfigService) {}

  all(): WalletProduct[] {
    return this.mergeConfiguredProducts(this.defaultProducts());
  }

  enabled(): WalletProduct[] {
    return this.all().filter((product) => product.enabled);
  }

  find(currency: string): WalletProduct | null {
    const normalized = this.normalizeCurrency(currency);
    return (
      this.all().find((product) => product.currency === normalized) ?? null
    );
  }

  compatibleProducts(jurisdiction: AccountJurisdiction): WalletProduct[] {
    return this.enabled().filter((product) =>
      product.supportedJurisdictions.includes(jurisdiction),
    );
  }

  providerConfigured(product: WalletProduct) {
    const missingEnvVars = ['FINCRA_API_KEY', 'FINCRA_BASE_URL'].filter(
      (key) => !this.configService.get<string>(key),
    );
    const missingProductConfig = product.providerProductId
      ? []
      : [`FINCRA_${product.currency}_PRODUCT_ID`];

    return {
      configured:
        missingEnvVars.length === 0 &&
        missingProductConfig.length === 0 &&
        product.canProvision,
      missingRequirements: [...missingEnvVars, ...missingProductConfig],
      blockedResponse: createBlockedResponse({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: `${product.currency} wallet activation is not configured yet.`,
        feature: `${product.currency} wallet activation`,
        capability: 'wallet_activation',
        provider: 'FINCRA',
        reason:
          'Fincra sandbox credentials and an approved Vidal Pay product id are required before this wallet can be provisioned.',
        missingRequirements: [...missingEnvVars, ...missingProductConfig],
        retryable: false,
      }),
    };
  }

  normalizeCurrency(value: string) {
    return value.trim().toUpperCase();
  }

  private defaultProducts(): WalletProduct[] {
    return ['NGN', 'USD', 'GBP'].map((currency) => ({
      currency,
      provider: 'FINCRA' as const,
      enabled: true,
      accountType: 'VIRTUAL_ACCOUNT' as const,
      tier: 'PRIMARY' as const,
      supportedJurisdictions: ['NG', 'US'],
      canProvision: false,
      requirementsConfigured: false,
      requirements: [],
      providerProductId:
        this.configService.get<string>(`FINCRA_${currency}_PRODUCT_ID`) ?? null,
      providerMetadata: {
        source: 'DEFAULT_PRIMARY_CATALOGUE',
        requirementsSource: 'NOT_CONFIGURED',
      },
    }));
  }

  private mergeConfiguredProducts(defaults: WalletProduct[]) {
    const configured = this.readConfiguredProducts();
    if (configured.length === 0) return defaults;

    const byCurrency = new Map(
      defaults.map((product) => [product.currency, product] as const),
    );
    configured.forEach((product) => {
      const existing = byCurrency.get(product.currency);
      byCurrency.set(product.currency, {
        ...(existing ?? product),
        ...product,
        provider: 'FINCRA',
        currency: product.currency,
        requirements: product.requirements ?? existing?.requirements ?? [],
        providerMetadata: {
          ...(existing?.providerMetadata ?? {}),
          ...(product.providerMetadata ?? {}),
        },
      });
    });
    return [...byCurrency.values()].sort((left, right) => {
      if (left.tier !== right.tier) return left.tier === 'PRIMARY' ? -1 : 1;
      return left.currency.localeCompare(right.currency);
    });
  }

  private readConfiguredProducts(): WalletProduct[] {
    const raw = this.configService.get<string>('FINCRA_WALLET_PRODUCTS_JSON');
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => this.normalizeConfiguredProduct(item))
        .filter((item): item is WalletProduct => Boolean(item));
    } catch {
      return [];
    }
  }

  private normalizeConfiguredProduct(value: unknown): WalletProduct | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const currency =
      typeof record.currency === 'string'
        ? this.normalizeCurrency(record.currency)
        : null;
    if (!currency) return null;

    const supportedJurisdictions: AccountJurisdiction[] = Array.isArray(
      record.supportedJurisdictions,
    )
      ? record.supportedJurisdictions
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toUpperCase())
          .filter((item): item is AccountJurisdiction =>
            ['NG', 'US'].includes(item),
          )
      : ['NG', 'US'];

    const requirements = Array.isArray(record.requirements)
      ? record.requirements
          .map((item) => this.normalizeRequirement(item))
          .filter((item): item is WalletProductRequirement => Boolean(item))
      : [];

    return {
      currency,
      provider: 'FINCRA',
      enabled: record.enabled === true,
      accountType:
        record.accountType === 'WALLET_ACCOUNT'
          ? 'WALLET_ACCOUNT'
          : 'VIRTUAL_ACCOUNT',
      tier: record.tier === 'PRIMARY' ? 'PRIMARY' : 'ADDITIONAL',
      supportedJurisdictions,
      canProvision: record.canProvision === true,
      requirementsConfigured: record.requirementsConfigured === true,
      requirements,
      providerProductId:
        typeof record.providerProductId === 'string'
          ? record.providerProductId
          : (this.configService.get<string>(`FINCRA_${currency}_PRODUCT_ID`) ??
            null),
      providerMetadata:
        record.providerMetadata && typeof record.providerMetadata === 'object'
          ? (record.providerMetadata as Record<string, unknown>)
          : {},
    };
  }

  private normalizeRequirement(
    value: unknown,
  ): WalletProductRequirement | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.key !== 'string' || record.key.trim().length === 0) {
      return null;
    }
    const key = record.key.trim().toLowerCase();
    return {
      key,
      label:
        typeof record.label === 'string' && record.label.trim().length > 0
          ? record.label.trim()
          : key.replace(/_/g, ' '),
      source:
        record.source === 'VIDALPAY_PROFILE' ||
        record.source === 'METAMAP' ||
        record.source === 'FINCRA' ||
        record.source === 'MANUAL'
          ? record.source
          : 'FINCRA',
      providerReference:
        typeof record.providerReference === 'string'
          ? record.providerReference
          : null,
    };
  }
}
