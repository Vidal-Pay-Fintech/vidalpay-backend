import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderHttpService } from './provider-http.service';

type JsonRecord = Record<string, unknown>;
type ReloadlyProduct = 'airtime' | 'data' | 'utilities';

@Injectable()
export class SandboxProviderService {
  private readonly reloadlyTokens = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly http: ProviderHttpService,
  ) {}

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
