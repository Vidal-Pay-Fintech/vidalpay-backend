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

  it('pins the Fincra client to the sandbox host and rejects SSRF-style base URLs', () => {
    expect(
      service({ FINCRA_BASE_URL: 'https://sandboxapi.fincra.com' })
        .fincraClient()
        .defaults.baseURL,
    ).toBe('https://sandboxapi.fincra.com');
    expect(
      service({ FINCRA_BASE_URL: 'http://127.0.0.1:10000' })
        .fincraClient()
        .defaults.baseURL,
    ).toBe('https://sandboxapi.fincra.com');
    expect(
      service({ FINCRA_BASE_URL: 'https://evil.example.com' })
        .fincraClient()
        .defaults.baseURL,
    ).toBe('https://sandboxapi.fincra.com');
    expect(
      service({ FINCRA_BASE_URL: 'https://user:pass@sandboxapi.fincra.com' })
        .fincraClient()
        .defaults.baseURL,
    ).toBe('https://sandboxapi.fincra.com');
  });

  it('keeps the Fincra API key only in backend request headers', () => {
    const client = service({ FINCRA_API_KEY: 'fincra-secret' }).fincraClient();

    expect(client.defaults.headers).toEqual(
      expect.objectContaining({ 'api-key': 'fincra-secret' }),
    );
    expect(client.defaults.baseURL).not.toContain('fincra-secret');
  });
});
