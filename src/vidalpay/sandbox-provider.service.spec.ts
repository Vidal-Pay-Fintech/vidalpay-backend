import { ConfigService } from '@nestjs/config';
import { SandboxProviderService } from './sandbox-provider.service';

describe('SandboxProviderService', () => {
  const post = jest.fn();
  const get = jest.fn();
  const http = {
    sudoClient: jest.fn(() => ({ post })),
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
});
