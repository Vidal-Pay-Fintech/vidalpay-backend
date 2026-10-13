import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError } from 'axios';
import { ProviderHttpService } from './provider-http.service';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class YellowCardService {
  constructor(private readonly providerHttpService: ProviderHttpService) {}

  async supportedAssets() {
    return this.safeRead('assets', async () => {
      const response = await this.providerHttpService
        .yellowCardClient()
        .get('/business/assets');
      return response.data;
    });
  }

  async supportedCurrencies() {
    return this.safeRead('currencies', async () => {
      const response = await this.providerHttpService
        .yellowCardClient()
        .get('/business/currencies');
      return response.data;
    });
  }

  async rates(query: AnyRecord) {
    return this.safeRead('rates', async () => {
      const response = await this.providerHttpService
        .yellowCardClient()
        .get('/rates', { params: query });
      return response.data;
    });
  }

  async quote(payload: AnyRecord) {
    return this.safeRead('quote', async () => {
      const response = await this.providerHttpService
        .yellowCardClient()
        .post('/quotes', payload);
      return response.data;
    });
  }

  private async safeRead<T>(
    capability: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const axiosError = error as AxiosError<AnyRecord>;
      throw new ServiceUnavailableException({
        code: 'YELLOWCARD_PROVIDER_UNAVAILABLE',
        capability: `crypto_${capability}`,
        provider: 'Yellow Card',
        status: axiosError.response?.status ?? null,
        message:
          'Yellow Card sandbox could not return this crypto provider resource right now.',
      });
    }
  }
}
