import { ConfigService } from '@nestjs/config';
import { WalletProductCatalogService } from './wallet-product-catalog.service';

const config = (values: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('WalletProductCatalogService', () => {
  it('includes NGN, USD, GBP, and CAD as primary Fincra products', () => {
    const service = new WalletProductCatalogService(config());

    expect(service.find('NGN')).toEqual(expect.objectContaining({ currency: 'NGN', tier: 'PRIMARY', enabled: true }));
    expect(service.find('USD')).toEqual(expect.objectContaining({ currency: 'USD', tier: 'PRIMARY', enabled: true }));
    expect(service.find('GBP')).toEqual(expect.objectContaining({ currency: 'GBP', tier: 'PRIMARY', enabled: true }));
    expect(service.find('CAD')).toEqual(expect.objectContaining({ currency: 'CAD', tier: 'PRIMARY', enabled: true }));
  });

  it('ignores configured currencies outside the approved Fincra sandbox wallet set', () => {
    const service = new WalletProductCatalogService(
      config({
        FINCRA_WALLET_PRODUCTS_JSON: JSON.stringify([
          { currency: 'EUR', enabled: true, tier: 'ADDITIONAL', supportedJurisdictions: ['NG'] },
        ]),
      }),
    );

    expect(service.find('EUR')).toBeNull();
    expect(service.enabled().map((product) => product.currency)).not.toContain('EUR');
  });

  it('excludes disabled configured currencies from enabled products', () => {
    const service = new WalletProductCatalogService(
      config({
        FINCRA_WALLET_PRODUCTS_JSON: JSON.stringify([
          { currency: 'EUR', enabled: false, tier: 'ADDITIONAL', supportedJurisdictions: ['NG'] },
        ]),
      }),
    );

    expect(service.enabled().map((product) => product.currency)).not.toContain('EUR');
  });

  it('does not include arbitrary ISO currencies without explicit Fincra catalogue config', () => {
    const service = new WalletProductCatalogService(config());

    expect(service.find('EUR')).toBeNull();
  });

  it('includes additional enabled Fincra currencies from explicit catalogue config', () => {
    const service = new WalletProductCatalogService(
      config({
        FINCRA_WALLET_PRODUCTS_JSON: JSON.stringify([
          {
            currency: 'CAD',
            enabled: true,
            tier: 'ADDITIONAL',
            supportedJurisdictions: ['NG'],
            canProvision: false,
            requirementsConfigured: true,
            requirements: [{ key: 'legal_name', label: 'Legal name', source: 'VIDALPAY_PROFILE' }],
          },
        ]),
      }),
    );

    expect(service.compatibleProducts('NG').map((product) => product.currency)).toContain('CAD');
    expect(service.find('CAD')).toEqual(expect.objectContaining({ tier: 'ADDITIONAL' }));
  });

  it('requires explicit Fincra sandbox product and jurisdiction approval', () => {
    const service = new WalletProductCatalogService(
      config({
        FINCRA_WALLET_TEST_MODE: 'true',
        FINCRA_API_KEY: 'fincra-key',
        FINCRA_GBP_SANDBOX_VA_SUPPORT: 'true',
        FINCRA_GBP_SUPPORTED_JURISDICTIONS: 'GB',
        FINCRA_GBP_CAN_PROVISION: 'true',
      }),
    );

    expect(service.find('GBP')).toEqual(
      expect.objectContaining({
        currency: 'GBP',
        canProvision: true,
        requirementsConfigured: true,
        providerMetadata: expect.objectContaining({
          requirementsSource: 'SANDBOX_TEST_MODE_DEFAULTS',
        }),
      }),
    );
    expect(service.providerConfigured(service.find('GBP')!).configured).toBe(
      true,
    );
    expect(service.compatibleProducts('GB').map((product) => product.currency)).toContain('GBP');
    expect(service.compatibleProducts('US').map((product) => product.currency)).not.toContain('GBP');
    expect(service.find('GBP')?.requirements.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'legal_name',
        'date_of_birth',
        'address',
        'government_id',
      ]),
    );
  });
});
