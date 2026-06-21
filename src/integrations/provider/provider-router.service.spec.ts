import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { ProviderRouterService } from './provider-router.service';

describe('ProviderRouterService production safety', () => {
  const liveNg = { providerName: 'flutterwave' };
  const liveUs = { providerName: 'leadbank' };
  const mockNg = { providerName: 'mock-flutterwave' };
  const mockUs = { providerName: 'mock-leadbank' };

  const createService = (values: Record<string, string>) => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new ProviderRouterService(
      liveNg as any,
      liveUs as any,
      mockNg as any,
      mockUs as any,
      configService,
    );
  };

  it('never routes production traffic to a mock provider', () => {
    const service = createService({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER_MODE: 'mock',
    });

    expect(() => service.getProviderByRegion(SupportedRegion.NG)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('allows mock providers in explicitly configured non-production environments', () => {
    const service = createService({
      NODE_ENV: 'test',
      PAYMENT_PROVIDER_MODE: 'mock',
    });

    expect(service.getProviderByRegion(SupportedRegion.NG)).toBe(mockNg);
  });

  it('routes production traffic to the configured live provider', () => {
    const service = createService({
      NODE_ENV: 'production',
      PAYMENT_PROVIDER_MODE: 'flutterwave',
    });

    expect(service.getProviderByRegion(SupportedRegion.NG)).toBe(liveNg);
  });
});
