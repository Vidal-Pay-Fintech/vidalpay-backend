import { ConfigService } from '@nestjs/config';
import { SandboxProviderService } from './sandbox-provider.service';

describe('SandboxProviderService', () => {
  const post = jest.fn();
  const get = jest.fn();
  const http = {
    sudoClient: jest.fn(() => ({ post })),
    fincraClient: jest.fn(() => ({ get, post })),
    vtuNgClient: jest.fn(() => ({ get, post })),
    reloadlyAuthClient: jest.fn(() => ({ post })),
    reloadlyAirtimeClient: jest.fn(() => ({ get, post })),
    reloadlyUtilitiesClient: jest.fn(() => ({ get, post })),
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          SUDO_CARD_PROGRAM_ID: 'program-1',
          RELOADLY_CLIENT_ID: 'client-1',
          RELOADLY_CLIENT_SECRET: 'secret-1',
        })[key],
    ),
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates an NGN card through the Sudo sandbox contract', async () => {
    post.mockResolvedValueOnce({ data: { id: 'card-1', status: 'active' } });
    const service = new SandboxProviderService(
      config as unknown as ConfigService,
      http as any,
    );
    await expect(
      service.createSudoCard({
        type: 'virtual',
        cardholderId: 'holder-1',
        fundingSourceId: 'funding-1',
      }),
    ).resolves.toEqual({ id: 'card-1', status: 'active' });
    expect(post).toHaveBeenCalledWith(
      '/cards',
      expect.objectContaining({
        type: 'virtual',
        currency: 'NGN',
        cardProgramId: 'program-1',
      }),
    );
  });

  it('authenticates with the correct Reloadly sandbox audience and loads data operators', async () => {
    post.mockResolvedValueOnce({
      data: { access_token: 'token-1', expires_in: 300 },
    });
    get.mockResolvedValueOnce({ data: { content: [] } });
    const service = new SandboxProviderService(
      config as unknown as ConfigService,
      http as any,
    );
    await expect(service.getReloadlyCatalog('data')).resolves.toEqual({
      content: [],
    });
    expect(post).toHaveBeenCalledWith(
      '/oauth/token',
      expect.objectContaining({
        audience: 'https://topups-sandbox.reloadly.com',
        grant_type: 'client_credentials',
      }),
    );
    expect(get).toHaveBeenCalledWith(
      '/operators/countries/NG?includeBundles=true',
    );
  });

  it('loads Fincra read-only treasury rates without mutating provider resources', async () => {
    get.mockResolvedValueOnce({ data: { data: [] } });
    const service = new SandboxProviderService(
      config as unknown as ConfigService,
      http as any,
    );
    await expect(service.getFincraRates()).resolves.toEqual({ data: [] });
    expect(get).toHaveBeenCalledWith('/quotes/treasury-orders/rates', {
      params: {},
    });
  });

  it('uses VTU.ng v2 JWT auth for purchase submissions', async () => {
    post
      .mockResolvedValueOnce({ data: { token: 'vtu-token' } })
      .mockResolvedValueOnce({ data: { request_id: 'request-1' } });
    const service = new SandboxProviderService(
      config as unknown as ConfigService,
      http as any,
    );
    await expect(
      service.purchaseVtuNg('airtime', {
        request_id: 'request-1',
        service_id: 'mtn',
        phone: '08030000000',
        amount: 100,
      }),
    ).resolves.toEqual({ request_id: 'request-1' });
    expect(post).toHaveBeenNthCalledWith(1, '/jwt-auth/v1/token', {
      username: undefined,
      password: undefined,
    });
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/api/v2/airtime',
      expect.objectContaining({ request_id: 'request-1' }),
    );
  });

  it('uses VTU.ng v2 endpoints for TV, betting, ePIN and requery operations', async () => {
    post
      .mockResolvedValueOnce({ data: { token: 'vtu-token' } })
      .mockResolvedValueOnce({ data: { request_id: 'tv-1' } })
      .mockResolvedValueOnce({ data: { request_id: 'bet-1' } })
      .mockResolvedValueOnce({ data: { request_id: 'epin-1' } })
      .mockResolvedValueOnce({ data: { request_id: 'tv-1', status: 'completed-api' } });
    const service = new SandboxProviderService(
      config as unknown as ConfigService,
      http as any,
    );

    await service.purchaseVtuNg('tv', {
      request_id: 'tv-1',
      service_id: 'dstv',
      customer_id: '1234567890',
      variation_id: 'compact',
    });
    await service.purchaseVtuNg('betting', {
      request_id: 'bet-1',
      service_id: 'bet9ja',
      customer_id: '1234567890',
      amount: 1000,
    });
    await service.purchaseVtuNg('epins', {
      request_id: 'epin-1',
      service_id: 'waec',
      value: 5000,
      quantity: 1,
    });
    await service.requeryVtuNg('tv-1');

    expect(post).toHaveBeenNthCalledWith(2, '/api/v2/tv', expect.any(Object));
    expect(post).toHaveBeenNthCalledWith(3, '/api/v2/betting', expect.any(Object));
    expect(post).toHaveBeenNthCalledWith(4, '/api/v2/epins', expect.any(Object));
    expect(post).toHaveBeenNthCalledWith(5, '/api/v2/requery', {
      request_id: 'tv-1',
    });
  });

});
