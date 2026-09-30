import { Injectable } from '@nestjs/common';
import { AxiosError, AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { ProviderHttpService } from './provider-http.service';

export type FincraProbeEndpoint = {
  name: string;
  method: 'GET';
  path: string;
  query?: Record<string, string>;
};

export type FincraProbeResult = {
  name: string;
  method: string;
  path: string;
  status: number | null;
  ok: boolean;
  errorCode: string | null;
  message: string | null;
  data: {
    type: 'object' | 'array' | 'primitive' | 'empty';
    keys: string[];
    count: number | null;
    currencies: string[];
    requestId: string | null;
  };
};

const DASHBOARD_OBSERVED_CURRENCIES = [
  'USD',
  'GBP',
  'NGN',
  'EUR',
  'CAD',
  'GHS',
  'UGX',
  'KES',
  'ZAR',
  'XOF',
  'ETB',
  'MWK',
  'RWF',
  'TZS',
  'XAF',
  'ZMW',
  'GNF',
  'PLN',
  'RUB',
  'USDT',
  'USDC',
  'CNGN',
  'CNY',
  'CNH',
];

@Injectable()
export class FincraSandboxService {
  constructor(
    private readonly configService: ConfigService,
    private readonly providerHttpService: ProviderHttpService,
  ) {}

  async probeReadOnly() {
    const configured = this.configurationStatus();
    const matrix = this.initialCurrencyMatrix();

    if (!configured.ready) {
      return {
        provider: 'FINCRA',
        environment: 'SANDBOX',
        ready: false,
        configuration: configured,
        authentication: {
          attempted: false,
          status: 'MISSING_CONFIGURATION',
          message:
            'FINCRA_API_KEY and FINCRA_BUSINESS_ID are required before authenticated sandbox probing can run.',
        },
        endpoints: [],
        currencyMatrix: matrix,
      };
    }

    const client = this.providerHttpService.fincraClient();
    const endpoints = await this.probeEndpoints(client, this.readOnlyEndpoints());
    const authenticated = endpoints.some(
      (endpoint) => endpoint.status !== 401 && endpoint.status !== 403,
    );

    return {
      provider: 'FINCRA',
      environment: 'SANDBOX',
      ready: authenticated,
      configuration: configured,
      authentication: {
        attempted: true,
        status: authenticated ? 'AUTHENTICATED_OR_PARTIALLY_AUTHENTICATED' : 'FAILED',
        message: authenticated
          ? 'At least one Fincra read-only endpoint returned a non-authentication response.'
          : 'Fincra rejected all read-only probes with authentication/authorization responses.',
      },
      endpoints,
      currencyMatrix: this.updateMatrixFromProbe(matrix, endpoints),
    };
  }

  private configurationStatus() {
    const required = ['FINCRA_API_KEY', 'FINCRA_BUSINESS_ID'];
    const optional = ['FINCRA_BASE_URL', 'FINCRA_PUBLIC_KEY', 'FINCRA_WEBHOOK_SECRET'];
    const missingRequired = required.filter((key) => !this.configService.get<string>(key));
    return {
      ready: missingRequired.length === 0,
      baseUrl:
        this.configService.get<string>('FINCRA_BASE_URL') ??
        'https://sandboxapi.fincra.com',
      required: required.map((key) => ({ key, configured: !missingRequired.includes(key) })),
      optional: optional.map((key) => ({ key, configured: Boolean(this.configService.get<string>(key)) })),
      missingRequired,
    };
  }

  private readOnlyEndpoints(): FincraProbeEndpoint[] {
    const businessID = this.configService.get<string>('FINCRA_BUSINESS_ID') ?? '';
    return [
      { name: 'business_wallets', method: 'GET', path: '/wallets', query: { businessID } },
      { name: 'merchant_profile', method: 'GET', path: '/profile/merchant/me' },
      { name: 'virtual_account_requests', method: 'GET', path: '/profile/virtual-accounts/requests' },
      { name: 'virtual_accounts', method: 'GET', path: '/profile/virtual-accounts' },
      { name: 'treasury_rates', method: 'GET', path: '/quotes/treasury-orders/rates' },
    ];
  }

  private async probeEndpoints(
    client: AxiosInstance,
    endpoints: FincraProbeEndpoint[],
  ) {
    const results: FincraProbeResult[] = [];
    for (const endpoint of endpoints) {
      results.push(await this.probeEndpoint(client, endpoint));
    }
    return results;
  }

  private async probeEndpoint(
    client: AxiosInstance,
    endpoint: FincraProbeEndpoint,
  ): Promise<FincraProbeResult> {
    try {
      const response = await client.request({
        method: endpoint.method,
        url: endpoint.path,
        params: endpoint.query,
      });
      return {
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        status: response.status,
        ok: response.status >= 200 && response.status < 300,
        errorCode: null,
        message: null,
        data: this.summarizeResponse(response.data),
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status ?? null;
      const body = axiosError.response?.data ?? null;
      return {
        name: endpoint.name,
        method: endpoint.method,
        path: endpoint.path,
        status,
        ok: false,
        errorCode: this.safeErrorCode(axiosError.code),
        message: this.safeErrorMessage(body, status),
        data: this.summarizeResponse(body),
      };
    }
  }

  private initialCurrencyMatrix() {
    return DASHBOARD_OBSERVED_CURRENCIES.map((currency) => ({
      currency,
      balance: 'DASHBOARD_OBSERVED',
      individualVirtualAccount: ['USDT', 'USDC', 'CNGN'].includes(currency)
        ? 'NOT_USER_WALLET'
        : 'UNKNOWN',
      collection: ['USDT', 'USDC', 'CNGN'].includes(currency)
        ? 'NOT_USER_WALLET'
        : 'UNKNOWN',
      payout: ['USDT', 'USDC', 'CNGN'].includes(currency)
        ? 'CRYPTO_PAYOUT_ONLY_UNKNOWN_APPROVAL'
        : 'UNKNOWN',
      fx: ['USDT', 'USDC', 'CNGN'].includes(currency)
        ? 'NOT_USER_WALLET'
        : 'UNKNOWN',
      sandboxTested: false,
      productionEnabled: 'UNKNOWN',
    }));
  }

  private updateMatrixFromProbe(
    matrix: ReturnType<FincraSandboxService['initialCurrencyMatrix']>,
    endpoints: FincraProbeResult[],
  ) {
    const wallets = endpoints.find((endpoint) => endpoint.name === 'business_wallets');
    if (!wallets?.ok) return matrix;

    const currencies = new Set(wallets.data.currencies);
    return matrix.map((item) =>
      currencies.has(item.currency)
        ? { ...item, balance: 'API_CONFIRMED', sandboxTested: true }
        : item,
    );
  }

  private extractCurrencies(data: unknown): Set<string> {
    const currencies = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (!value || typeof value !== 'object') return;
      Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
        if (key.toLowerCase().includes('currency') && typeof entry === 'string') {
          currencies.add(entry.toUpperCase());
        }
        walk(entry);
      });
    };
    walk(data);
    return currencies;
  }

  private summarizeResponse(value: unknown): FincraProbeResult['data'] {
    const currencies = [...this.extractCurrencies(value)].sort();
    const requestId = this.extractRequestId(value);
    if (Array.isArray(value)) {
      return {
        type: 'array',
        keys: [],
        count: value.length,
        currencies,
        requestId,
      };
    }
    if (!value || typeof value !== 'object') {
      return {
        type: value === null || value === undefined ? 'empty' : 'primitive',
        keys: [],
        count: null,
        currencies,
        requestId,
      };
    }
    const keys = Object.keys(value as Record<string, unknown>)
      .filter((key) => this.isSafeSummaryKey(key))
      .sort();
    return {
      type: 'object',
      keys,
      count: null,
      currencies,
      requestId,
    };
  }

  private isSafeSummaryKey(key: string) {
    return [
      'status',
      'success',
      'message',
      'data',
      'currency',
      'currencies',
      'request_id',
      'requestId',
      'code',
      'error',
      'errors',
    ].includes(key);
  }

  private safeErrorCode(code?: string) {
    if (!code) return null;
    return /^[A-Z0-9_ -]{1,40}$/i.test(code) ? code : 'REQUEST_FAILED';
  }

  private safeErrorMessage(value: unknown, status: number | null): string {
    const message = this.extractMessage(value);
    if (message && !this.looksSensitive(message)) return message;
    if (status === 401) return 'Fincra sandbox authentication failed.';
    if (status === 403) return 'Fincra sandbox authorization failed.';
    if (status && status >= 500) return 'Fincra sandbox returned a server error.';
    return 'Fincra sandbox request failed.';
  }

  private extractMessage(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return typeof record.message === 'string' ? record.message : null;
  }

  private extractRequestId(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const candidate = record.request_id ?? record.requestId;
    return typeof candidate === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(candidate)
      ? candidate
      : null;
  }

  private looksSensitive(value: string) {
    return /pk_|sk_|bearer|token|secret|account|authorization|email|phone|bvn|nin/i.test(
      value,
    );
  }
}
