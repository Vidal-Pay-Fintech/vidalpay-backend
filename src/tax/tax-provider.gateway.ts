import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getLiveProviderAdapterBySlug } from 'src/integrations/provider/live/live-provider-adapters';

@Injectable()
export class TaxProviderGateway {
  getProviderSlug() {
    const mode = String(process.env.TAX_PROVIDER_MODE ?? '').toLowerCase();
    if (!['april', 'column'].includes(mode)) {
      throw new ServiceUnavailableException(
        'A live tax provider has not been selected.',
      );
    }
    return mode;
  }

  async execute(
    operationType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const providerSlug = this.getProviderSlug();
    const adapter = getLiveProviderAdapterBySlug(providerSlug);
    if (!adapter) {
      throw new ServiceUnavailableException(
        `${providerSlug} tax provider adapter is unavailable.`,
      );
    }

    try {
      adapter.validateConfig();
      return await adapter.execute({ operationType, payload, idempotencyKey });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : 'Tax provider operation is unavailable.',
      );
    }
  }
}
