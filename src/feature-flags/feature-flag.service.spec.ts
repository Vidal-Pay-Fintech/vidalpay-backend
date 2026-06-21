import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService production safety', () => {
  const createService = (values: Record<string, string>) => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new FeatureFlagService(configService);
  };

  it('hides demo operations in production even when flags are enabled', () => {
    const service = createService({
      NODE_ENV: 'production',
      ENABLE_DEMO_MODE: 'true',
      ENABLE_VIRTUAL_CARD_DEMO: 'true',
    });

    expect(() =>
      service.assertDemoEnabled('ENABLE_VIRTUAL_CARD_DEMO'),
    ).toThrow(NotFoundException);
  });

  it('allows explicitly enabled demo operations outside production', () => {
    const service = createService({
      NODE_ENV: 'development',
      ENABLE_DEMO_MODE: 'true',
      ENABLE_FX_CONVERSION_DEMO: 'true',
    });

    expect(() =>
      service.assertDemoEnabled('ENABLE_FX_CONVERSION_DEMO'),
    ).not.toThrow();
  });

  it('rejects disabled demo operations outside production', () => {
    const service = createService({
      NODE_ENV: 'development',
      ENABLE_DEMO_MODE: 'false',
    });

    expect(() => service.assertDemoEnabled()).toThrow(
      ServiceUnavailableException,
    );
  });
});
