import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { KycProviderRouterService } from './kyc-provider-router.service';

describe('KycProviderRouterService production safety', () => {
  const payload = {
    user: { id: 'user-id' },
    kyc: {},
    region: SupportedRegion.NG,
  } as any;

  const createService = (environment: string) => {
    const flutterwave = { submitKyc: jest.fn() };
    const leadBank = { submitKyc: jest.fn() };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? environment : undefined,
      ),
    } as unknown as ConfigService;

    return {
      service: new KycProviderRouterService(
        flutterwave as any,
        leadBank as any,
        configService,
      ),
      flutterwave,
    };
  };

  it('rejects stubbed KYC submission in production', async () => {
    const { service } = createService('production');

    await expect(service.submitKyc(SupportedRegion.NG, payload)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('keeps stubbed KYC available for non-production testing', async () => {
    const { service, flutterwave } = createService('test');
    flutterwave.submitKyc.mockResolvedValue({ status: 'PENDING_REVIEW' });

    await expect(
      service.submitKyc(SupportedRegion.NG, payload),
    ).resolves.toEqual({ status: 'PENDING_REVIEW' });
  });
});
