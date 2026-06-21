import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getLiveProviderAdapterBySlug } from 'src/integrations/provider/live/live-provider-adapters';

@Injectable()
export class CryptoProviderGateway {
  async execute(
    operationType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const adapter = getLiveProviderAdapterBySlug('zerohash');
    if (!adapter) {
      throw new Error('Zero Hash provider adapter is unavailable.');
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
          : 'Zero Hash provider operation is unavailable.',
      );
    }
  }
}
