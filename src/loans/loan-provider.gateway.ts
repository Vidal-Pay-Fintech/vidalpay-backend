import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class LoanProviderGateway {
  async execute(
    _operationType: string,
    _payload: Record<string, unknown>,
    _idempotencyKey: string,
  ): Promise<{
    providerReference: string | null;
    status: string;
    data: Record<string, unknown>;
  }> {
    throw new ServiceUnavailableException(
      'No licensed lending provider has been connected.',
    );
  }
}
