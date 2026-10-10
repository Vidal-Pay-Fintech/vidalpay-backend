import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderHttpService } from './provider-http.service';

type JsonRecord = Record<string, unknown>;
type ReloadlyProduct = 'airtime' | 'data' | 'utilities';
type FincraFxRateQuery = { baseCurrency?: string; quoteCurrency?: string };
export type VtuProduct =
  | 'airtime'
  | 'data'
  | 'utilities'
  | 'electricity'
  | 'tv'
  | 'betting'
  | 'epins';

@Injectable()
export class SandboxProviderService {
  private readonly reloadlyTokens = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  private vtuTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly http: ProviderHttpService,
  ) {}

  async verifyFincraBvn(input: {
    bvn: string;
    businessId: string;
  }): Promise<JsonRecord> {
    const { data } = await this.http
      .fincraClient()
      .post('/core/bvn-verification', {
        bvn: input.bvn,
        business: input.businessId,
      });
    return data as JsonRecord;
  }

  async getFincraRates(query: FincraFxRateQuery = {}): Promise<JsonRecord> {
    const params: JsonRecord = {};
    if (query.baseCurrency) params.baseCurrency = query.baseCurrency;
    if (query.quoteCurrency) params.quoteCurrency = query.quoteCurrency;
    const { data } = await this.http
      .fincraClient()
      .get('/quotes/treasury-orders/rates', { params });
    return data as JsonRecord;
  }

  async getVtuNgBalance(): Promise<JsonRecord> {
    const token = await this.vtuNgToken();
    const { data } = await this.http.vtuNgClient(token).get('/api/v2/balance');
    return data as JsonRecord;
  }

  async getVtuNgCatalog(
    product: VtuProduct,
    serviceId?: string,
  ): Promise<JsonRecord> {
    const normalizedProduct = product === 'utilities' ? 'electricity' : product;
    if (normalizedProduct === 'data' || normalizedProduct === 'tv') {
      const params = serviceId ? { service_id: serviceId } : undefined;
      const { data } = await this.http
        .vtuNgClient()
        .get(`/api/v2/variations/${normalizedProduct}`, { params });
      return data as JsonRecord;
    }
    if (normalizedProduct === 'electricity') {
      return {
        code: 'success',
        message:
          'VTU.ng electricity provider verification uses service_id and meter variation_id from the provider contract.',
        data: [
          { service_id: 'ikeja-electric', service_name: 'Ikeja Electric' },
          { service_id: 'eko-electric', service_name: 'Eko Electric' },
          { service_id: 'abuja-electric', service_name: 'Abuja Electric' },
          { service_id: 'kano-electric', service_name: 'Kano Electric' },
          {
            service_id: 'portharcourt-electric',
            service_name: 'Port Harcourt Electric',
          },
          { service_id: 'jos-electric', service_name: 'Jos Electric' },
          { service_id: 'ibadan-electric', service_name: 'Ibadan Electric' },
          { service_id: 'enugu-electric', service_name: 'Enugu Electric' },
          { service_id: 'kaduna-electric', service_name: 'Kaduna Electric' },
          { service_id: 'benin-electric', service_name: 'Benin Electric' },
          { service_id: 'aba-electric', service_name: 'Aba Electric' },
          { service_id: 'yola-electric', service_name: 'Yola Electric' },
        ],
      };
    }
    if (normalizedProduct === 'betting') {
      return {
        code: 'success',
        message: 'VTU.ng betting services use verify-customer before funding.',
        data: [
          { service_id: '1xBet', service_name: '1xBet' },
          { service_id: 'BangBet', service_name: 'BangBet' },
          { service_id: 'Bet9ja', service_name: 'Bet9ja' },
          { service_id: 'BetKing', service_name: 'BetKing' },
          { service_id: 'BetLand', service_name: 'BetLand' },
          { service_id: 'BetLion', service_name: 'BetLion' },
          { service_id: 'BetWay', service_name: 'BetWay' },
          { service_id: 'CloudBet', service_name: 'CloudBet' },
          { service_id: 'LiveScoreBet', service_name: 'LiveScoreBet' },
          { service_id: 'MerryBet', service_name: 'MerryBet' },
          { service_id: 'NaijaBet', service_name: 'NaijaBet' },
          { service_id: 'NairaBet', service_name: 'NairaBet' },
          { service_id: 'SportyBet', service_name: 'SportyBet' },
          { service_id: 'SupaBet', service_name: 'SupaBet' },
        ],
      };
    }
    if (normalizedProduct === 'epins') {
      return {
        code: 'success',
        message: 'VTU.ng ePIN services require service_id, value and quantity.',
        data: [
          { service_id: 'mtn', service_name: 'MTN' },
          { service_id: 'airtel', service_name: 'Airtel' },
          { service_id: 'glo', service_name: 'Glo' },
          { service_id: '9mobile', service_name: '9mobile' },
        ],
      };
    }
    return {
      code: 'success',
      message: 'VTU.ng airtime providers are static in the v2 contract.',
      data: [
        { service_id: 'mtn', service_name: 'MTN' },
        { service_id: 'airtel', service_name: 'Airtel' },
        { service_id: 'glo', service_name: 'Glo' },
        { service_id: '9mobile', service_name: '9mobile' },
      ],
    };
  }

  async validateVtuNgCustomer(payload: JsonRecord): Promise<JsonRecord> {
    const token = await this.vtuNgToken();
    const { data } = await this.http
      .vtuNgClient(token)
      .post('/api/v2/verify-customer', payload);
    return data as JsonRecord;
  }

  async purchaseVtuNg(
    product: VtuProduct,
    payload: JsonRecord,
  ): Promise<JsonRecord> {
    const token = await this.vtuNgToken();
    const normalizedProduct = product === 'utilities' ? 'electricity' : product;
    const endpointByProduct: Record<VtuProduct, string> = {
      airtime: '/api/v2/airtime',
      data: '/api/v2/data',
      utilities: '/api/v2/electricity',
      electricity: '/api/v2/electricity',
      tv: '/api/v2/tv',
      betting: '/api/v2/betting',
      epins: '/api/v2/epins',
    };
    const endpoint = endpointByProduct[normalizedProduct];
    const { data } = await this.http.vtuNgClient(token).post(endpoint, payload);
    return data as JsonRecord;
  }

  async requeryVtuNg(requestId: string): Promise<JsonRecord> {
    const token = await this.vtuNgToken();
    const { data } = await this.http
      .vtuNgClient(token)
      .post('/api/v2/requery', { request_id: requestId });
    return data as JsonRecord;
  }

  async createSudoCard(input: {
    type: 'virtual' | 'physical';
    cardholderId: string;
    fundingSourceId: string;
    cardProgramId?: string;
    metadata?: JsonRecord;
  }): Promise<JsonRecord> {
    const cardProgramId =
      input.cardProgramId ?? this.config.get<string>('SUDO_CARD_PROGRAM_ID');
    const { data } = await this.http.sudoClient().post('/cards', {
      type: input.type,
      currency: 'NGN',
      cardholderId: input.cardholderId,
      fundingSourceId: input.fundingSourceId,
      cardProgramId,
      metadata: input.metadata,
    });
    return data as JsonRecord;
  }

  async getReloadlyCatalog(product: ReloadlyProduct): Promise<JsonRecord> {
    if (product === 'utilities') {
      const token = await this.reloadlyToken(
        this.config.get<string>('RELOADLY_UTILITIES_AUDIENCE') ??
          'https://utilities-sandbox.reloadly.com',
      );
      const path =
        this.config.get<string>('RELOADLY_UTILITIES_CATALOG_PATH') ??
        '/billers/countries/NG';
      const { data } = await this.http.reloadlyUtilitiesClient(token).get(path);
      return data as JsonRecord;
    }

    const token = await this.reloadlyToken(
      this.config.get<string>('RELOADLY_AIRTIME_AUDIENCE') ??
        'https://topups-sandbox.reloadly.com',
    );
    const configuredPath = this.config.get<string>(
      product === 'data'
        ? 'RELOADLY_DATA_CATALOG_PATH'
        : 'RELOADLY_AIRTIME_CATALOG_PATH',
    );
    const path =
      configuredPath ??
      `/operators/countries/NG?includeBundles=${product === 'data' ? 'true' : 'false'}`;
    const { data } = await this.http.reloadlyAirtimeClient(token).get(path);
    return data as JsonRecord;
  }

  async validateReloadlyUtility(payload: JsonRecord): Promise<JsonRecord> {
    const token = await this.reloadlyToken(
      this.config.get<string>('RELOADLY_UTILITIES_AUDIENCE') ??
        'https://utilities-sandbox.reloadly.com',
    );
    const path =
      this.config.get<string>('RELOADLY_UTILITIES_VALIDATE_PATH') ??
      '/accounts/validate';
    const { data } = await this.http
      .reloadlyUtilitiesClient(token)
      .post(path, payload);
    return data as JsonRecord;
  }

  async purchaseReloadly(
    product: ReloadlyProduct,
    payload: JsonRecord,
  ): Promise<JsonRecord> {
    const utilities = product === 'utilities';
    const audience = utilities
      ? (this.config.get<string>('RELOADLY_UTILITIES_AUDIENCE') ??
        'https://utilities-sandbox.reloadly.com')
      : (this.config.get<string>('RELOADLY_AIRTIME_AUDIENCE') ??
        'https://topups-sandbox.reloadly.com');
    const token = await this.reloadlyToken(audience);
    const client = utilities
      ? this.http.reloadlyUtilitiesClient(token)
      : this.http.reloadlyAirtimeClient(token);
    const path = utilities
      ? (this.config.get<string>('RELOADLY_UTILITIES_PAYMENT_PATH') ?? '/pay')
      : (this.config.get<string>('RELOADLY_TOPUP_PATH') ?? '/topups');
    const { data } = await client.post(path, payload);
    return data as JsonRecord;
  }

  private async vtuNgToken(): Promise<string> {
    if (
      this.vtuTokenCache &&
      this.vtuTokenCache.expiresAt > Date.now() + 30_000
    ) {
      return this.vtuTokenCache.token;
    }
    const username =
      this.config.get<string>('VTU_USERNAME') ??
      this.config.get<string>('VTU_EMAIL') ??
      this.config.get<string>('VTU_API_USERNAME');
    const password =
      this.config.get<string>('VTU_PASSWORD') ??
      this.config.get<string>('VTU_API_PASSWORD');
    const { data } = await this.http.vtuNgClient().post('/jwt-auth/v1/token', {
      username,
      password,
    });
    const response = data as { token: string };
    this.vtuTokenCache = {
      token: response.token,
      expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
    };
    return response.token;
  }

  private async reloadlyToken(audience: string): Promise<string> {
    const cached = this.reloadlyTokens.get(audience);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

    const { data } = await this.http.reloadlyAuthClient().post('/oauth/token', {
      client_id: this.config.get<string>('RELOADLY_CLIENT_ID'),
      client_secret: this.config.get<string>('RELOADLY_CLIENT_SECRET'),
      grant_type: 'client_credentials',
      audience,
    });
    const response = data as { access_token: string; expires_in?: number };
    this.reloadlyTokens.set(audience, {
      token: response.access_token,
      expiresAt: Date.now() + Number(response.expires_in ?? 300) * 1000,
    });
    return response.access_token;
  }
}
