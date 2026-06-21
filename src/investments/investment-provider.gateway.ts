import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getLiveProviderAdapterBySlug } from 'src/integrations/provider/live/live-provider-adapters';

@Injectable()
export class InvestmentProviderGateway {
  async execute(
    operationType: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const adapter = getLiveProviderAdapterBySlug('cowrywise');
    if (!adapter) {
      throw new ServiceUnavailableException(
        'Cowrywise provider adapter is unavailable.',
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
          : 'Cowrywise provider operation is unavailable.',
      );
    }
  }
}
