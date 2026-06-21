import { BadRequestException } from '@nestjs/common';
import { SupportedRegion } from 'src/common/enum/supported-region.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import {
  SignupRegionService,
  SignupRegionSource,
} from './signup-region.service';

describe('SignupRegionService', () => {
  const service = new SignupRegionService();

  it('selects NGN when Nigerian signals agree', () => {
    expect(
      service.resolve({
        countryCode: 'NG',
        phoneNumber: '+2348012345678',
        ipCountryCode: 'NG',
      }),
    ).toMatchObject({
      region: SupportedRegion.NG,
      defaultCurrency: Currency.NGN,
      source: SignupRegionSource.DECLARED,
      confidence: 'HIGH',
      hasConflict: false,
    });
  });

  it('selects USD for a US signup', () => {
    expect(
      service.resolve({
        countryCode: 'US',
        phoneNumber: '+12025550123',
        ipCountryCode: 'US',
      }),
    ).toMatchObject({
      region: SupportedRegion.US,
      defaultCurrency: Currency.USD,
      hasConflict: false,
    });
  });

  it('records conflicting IP evidence without overriding a declared region', () => {
    expect(
      service.resolve({
        countryCode: 'NG',
        phoneNumber: '+2348012345678',
        ipCountryCode: 'US',
      }),
    ).toMatchObject({
      region: SupportedRegion.NG,
      defaultCurrency: Currency.NGN,
      confidence: 'LOW',
      hasConflict: true,
    });
  });

  it('uses phone prefix as a low-confidence fallback', () => {
    expect(service.resolve({ phoneNumber: '+2348012345678' })).toMatchObject({
      region: SupportedRegion.NG,
      source: SignupRegionSource.PHONE_PREFIX,
      confidence: 'LOW',
    });
  });

  it('rejects signup when no supported region can be resolved', () => {
    expect(() => service.resolve({ phoneNumber: '+447700900123' })).toThrow(
      BadRequestException,
    );
  });
});
