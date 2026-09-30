import { JurisdictionService } from './jurisdiction.service';

const service = new JurisdictionService();

describe('JurisdictionService', () => {
  it('resolves strong saved NG data as NG', () => {
    const result = service.resolve({
      residency: 'NG',
      country: 'Nigeria',
      countryCode: 'NG',
      region: 'NG',
      phoneNumber: '+2348012345678',
    } as any);

    expect(result.jurisdiction).toBe('NG');
    expect(result.confidence).toBe('HIGH');
    expect(result.reviewRequired).toBe(false);
  });

  it('does not let +234 phone override verified foreign jurisdiction', () => {
    const result = service.resolve({
      residency: 'US',
      country: 'United States',
      region: 'US',
      phoneNumber: '+2348012345678',
    } as any);

    expect(result.jurisdiction).toBe('US');
    expect(result.phoneCountry).toBe('NG');
    expect(result.reviewRequired).toBe(false);
  });

  it('does not let foreign phone override verified NG jurisdiction', () => {
    const result = service.resolve({
      residency: 'NG',
      country: 'Nigeria',
      region: 'NG',
      phoneNumber: '+14155550100',
    } as any);

    expect(result.jurisdiction).toBe('NG');
    expect(result.phoneCountry).toBe('US');
  });

  it('fails safely when authoritative jurisdiction signals conflict', () => {
    const result = service.resolve({
      residency: 'NG',
      country: 'United States',
      region: 'US',
      phoneNumber: '+14155550100',
    } as any);

    expect(result.jurisdiction).toBe('UNKNOWN');
    expect(result.reviewRequired).toBe(true);
    expect(result.source).toBe('CONFLICTING_ACCOUNT_PROFILE');
  });

  it('does not establish jurisdiction from phone alone', () => {
    const result = service.resolve({ phoneNumber: '+14155550100' } as any);

    expect(result.jurisdiction).toBe('UNKNOWN');
    expect(result.reviewRequired).toBe(true);
    expect(result.reason).toContain('Phone country code');
  });

  it('does not use wallet currency to infer jurisdiction', () => {
    const result = service.resolve({
      phoneNumber: '+14155550100',
      wallet: [{ currency: 'USD' }],
    } as any);

    expect(result.jurisdiction).toBe('UNKNOWN');
  });
});
