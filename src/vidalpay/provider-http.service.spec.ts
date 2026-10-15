import { ConfigService } from '@nestjs/config';
import { ProviderHttpService } from './provider-http.service';

describe('ProviderHttpService', () => {
  const service = (env: Record<string, string> = {}) =>
    new ProviderHttpService({
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService);

  it('uses official sandbox hosts when base URLs are absent', () => {
    const provider = service({ SUDO_API_KEY: 'test-key' });
    expect(provider.sudoClient().defaults.baseURL).toBe(
      'https://api.sandbox.sudo.africa',
    );
    expect(provider.reloadlyAirtimeClient('token').defaults.baseURL).toBe(
      'https://topups-sandbox.reloadly.com',
    );
    expect(provider.reloadlyUtilitiesClient('token').defaults.baseURL).toBe(
      'https://utilities-sandbox.reloadly.com',
    );
  });

  it('rejects malformed or non-HTTPS configured provider URLs', () => {
    const provider = service({
      SUDO_BASE_URL: 'not-a-url',
      RELOADLY_AIRTIME_BASE_URL: 'http://unsafe.example',
    });
    expect(provider.sudoClient().defaults.baseURL).toBe(
      'https://api.sandbox.sudo.africa',
    );
    expect(provider.reloadlyAirtimeClient('token').defaults.baseURL).toBe(
      'https://topups-sandbox.reloadly.com',
    );
  });

  it('keeps provider credentials in backend request headers', () => {
    const provider = service({ SUDO_API_KEY: 'sandbox-secret' });
    expect(provider.sudoClient().defaults.auth).toEqual({
      username: 'sandbox-secret',
      password: '',
    });
    expect(
      provider.reloadlyAirtimeClient('access-token').defaults.headers,
    ).toEqual(
      expect.objectContaining({ Authorization: 'Bearer access-token' }),
    );
  });

  it('defaults Fincra to sandbox and requires an explicit live environment', () => {
    expect(
      service({ FINCRA_API_KEY: 'sandbox-key' }).fincraClient().defaults.baseURL,
    ).toBe('https://sandboxapi.fincra.com');
    expect(
      service({ FINCRA_ENV: 'live', FINCRA_API_KEY: 'live-key' }).fincraClient().defaults.baseURL,
    ).toBe('https://api.fincra.com');
    expect(() => service({ FINCRA_BASE_URL: 'https://api.fincra.com' }).fincraClient()).toThrow('FINCRA_ENV=sandbox');
    expect(() => service({ FINCRA_ENV: 'live', FINCRA_BASE_URL: 'https://sandboxapi.fincra.com' }).fincraClient()).toThrow('FINCRA_ENV=live');
  });

  it.each([
    'not-a-url', 'http://127.0.0.1:10000', 'https://evil.example.com',
    'https://sandboxapi.fincra.com.evil.example', 'https://user:pass@sandboxapi.fincra.com',
    'https://sandboxapi.fincra.com:8443', 'https://sandboxapi.fincra.com/api',
    'https://sandboxapi.fincra.com?api-key=secret', 'https://sandboxapi.fincra.com#secret',
  ])('fails closed for an invalid Fincra host %s', (baseUrl) => {
    const provider = service({ FINCRA_BASE_URL: baseUrl });
    expect(() => provider.fincraClient()).toThrow('FINCRA_BASE_URL');
    expect(() => provider.onModuleInit()).toThrow('FINCRA_BASE_URL');
    try { provider.fincraClient(); } catch (error) {
      expect((error as Error).message).not.toContain('secret');
      expect((error as Error).message).not.toContain('user:pass');
    }
  });

  it('rejects missing credentials, unknown modes, and live sandbox probes', () => {
    expect(() => service().fincraClient()).toThrow('FINCRA_API_KEY');
    expect(() => service({ FINCRA_ENV: 'production' }).fincraClient()).toThrow('FINCRA_ENV');
    expect(() => service({ FINCRA_ENV: 'live', FINCRA_API_KEY: 'live-key' }).fincraSandboxClient()).toThrow('Sandbox probes');
    expect(() => service().onModuleInit()).not.toThrow();
  });

  it.each(['https://evil.example/path', '//evil.example/path'])('blocks per-request host overrides: %s', async (url) => {
    const client = service({ FINCRA_API_KEY: 'secret' }).fincraClient();
    const adapter = jest.fn();
    await expect(client.get(url, { adapter })).rejects.toThrow('official origin');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('blocks per-request base overrides and never follows authenticated redirects', async () => {
    const client = service({ FINCRA_API_KEY: 'secret' }).fincraClient();
    const adapter = jest.fn(async (config) => ({ data: {}, status: 302, statusText: 'Found', headers: {}, config }));
    await expect(client.get('/wallets', { baseURL: 'https://evil.example', adapter })).rejects.toThrow('official origin');
    expect(adapter).not.toHaveBeenCalled();
    await client.get('/wallets', { adapter, maxRedirects: 5 });
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://sandboxapi.fincra.com', url: '/wallets', maxRedirects: 0,
    }));
  });

  it('keeps the Fincra API key only in backend request headers', () => {
    const client = service({ FINCRA_API_KEY: 'fincra-secret' }).fincraClient();

    expect(client.defaults.headers).toEqual(
      expect.objectContaining({ 'api-key': 'fincra-secret' }),
    );
    expect(client.defaults.baseURL).not.toContain('fincra-secret');
  });
});
