import { ConfigService } from '@nestjs/config';
import { WalletProductCatalogService } from './wallet-product-catalog.service';

const config = (values: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('WalletProductCatalogService', () => {
  it('includes NGN, USD, and GBP as primary Fincra products', () => {
    const service = new WalletProductCatalogService(config());

    expect(service.find('NGN')).toEqual(expect.objectContaining({ currency: 'NGN', tier: 'PRIMARY', enabled: true }));
    expect(service.find('USD')).toEqual(expect.objectContaining({ currency: 'USD', tier: 'PRIMARY', enabled: true }));
    expect(service.find('GBP')).toEqual(expect.objectContaining({ currency: 'GBP', tier: 'PRIMARY', enabled: true }));
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

    expect(service.find('CAD')).toBeNull();
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
});
