import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class DisputeProviderGateway {
  execute(
    _operation: 'dispute_create' | 'refund_create',
    _payload: Record<string, unknown>,
    _idempotencyKey: string,
  ): Promise<never> {
    throw new ServiceUnavailableException(
      'No payment dispute provider has been connected.',
    );
  }
}
