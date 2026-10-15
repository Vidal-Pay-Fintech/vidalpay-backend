import { ConfigService } from '@nestjs/config';
import { FincraSandboxService } from './fincra-sandbox.service';

const config = (values: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

const configured = {
  FINCRA_API_KEY: 'secret',
  FINCRA_BUSINESS_ID: 'business-1',
};

describe('FincraSandboxService', () => {
  it.each([
    { FINCRA_ENV: 'live' },
    { FINCRA_BASE_URL: 'https://api.fincra.com' },
    { FINCRA_BASE_URL: 'https://secret@evil.example' },
  ])('does not send sandbox probes with invalid or live configuration', async (env) => {
    const http = { fincraSandboxClient: jest.fn() };
    const result = await new FincraSandboxService(config({ ...configured, ...env }), http as any).probeReadOnly();
    expect(result.ready).toBe(false);
    expect(result.authentication).toEqual(expect.objectContaining({ attempted: false, status: 'INVALID_CONFIGURATION' }));
    expect(http.fincraSandboxClient).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('secret@');
  });

  it.each([undefined, 404, 500, 401, 403])('never reports failed HTTP requests (%s) as authenticated', async (status) => {
    const client = { request: jest.fn().mockRejectedValue({ response: status ? { status } : undefined }) };
    const result = await new FincraSandboxService(config(configured), {
      fincraSandboxClient: () => client,
    } as any).probeReadOnly();
    expect(result.ready).toBe(false);
    expect(result.authentication.status).toBe('FAILED');
  });

  it('does not treat an HTTP 200 business rejection as authentication proof', async () => {
    const client = { request: jest.fn().mockResolvedValue({ status: 200, data: { success: false } }) };
    const result = await new FincraSandboxService(config(configured), {
      fincraSandboxClient: () => client,
    } as any).probeReadOnly();
    expect(result.ready).toBe(false);
  });

  it('does not attempt authenticated probes when required sandbox config is missing', async () => {
    const http = { fincraSandboxClient: jest.fn() };
    const service = new FincraSandboxService(config(), http as any);

    const result = await service.probeReadOnly();

    expect(result.ready).toBe(false);
    expect(result.authentication.attempted).toBe(false);
    expect(result.configuration.missingRequired).toEqual([
      'FINCRA_API_KEY',
      'FINCRA_BUSINESS_ID',
    ]);
    expect(http.fincraSandboxClient).not.toHaveBeenCalled();
  });

  it('handles missing FINCRA_API_KEY safely', async () => {
    const http = { fincraSandboxClient: jest.fn() };
    const service = new FincraSandboxService(
      config({ FINCRA_BUSINESS_ID: 'business-1' }),
      http as any,
    );

    const result = await service.probeReadOnly();

    expect(result.authentication.status).toBe('MISSING_CONFIGURATION');
    expect(result.configuration.missingRequired).toEqual(['FINCRA_API_KEY']);
    expect(http.fincraSandboxClient).not.toHaveBeenCalled();
  });

  it('handles missing FINCRA_BUSINESS_ID safely', async () => {
    const http = { fincraSandboxClient: jest.fn() };
    const service = new FincraSandboxService(
      config({ FINCRA_API_KEY: 'secret' }),
      http as any,
    );

    const result = await service.probeReadOnly();

    expect(result.authentication.status).toBe('MISSING_CONFIGURATION');
    expect(result.configuration.missingRequired).toEqual(['FINCRA_BUSINESS_ID']);
    expect(http.fincraSandboxClient).not.toHaveBeenCalled();
  });

  it('returns only allow-listed summaries from provider responses', async () => {
    const client = {
      request: jest.fn(async ({ method }: { method: string }) => ({
        status: 200,
        data: {
          currency: 'NGN',
          accountNumber: '1234567890',
          customerName: 'Jane Doe',
          nested: { email: 'jane@example.com', balance: 100 },
          method,
        },
      })),
    };
    const service = new FincraSandboxService(
      config(configured),
      { fincraSandboxClient: jest.fn(() => client) } as any,
    );

    const result = await service.probeReadOnly();
    const firstEndpoint = result.endpoints[0];

    expect(firstEndpoint.data).toEqual(
      expect.objectContaining({
        type: 'object',
        currencies: ['NGN'],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('1234567890');
    expect(JSON.stringify(result)).not.toContain('Jane Doe');
    expect(JSON.stringify(result)).not.toContain('jane@example.com');
    expect(result.currencyMatrix.find((item) => item.currency === 'NGN')?.balance).toBe('API_CONFIRMED');
  });

  it('uses GET/read-only methods only', async () => {
    const client = {
      request: jest.fn(async () => ({ status: 200, data: { currency: 'NGN' } })),
    };
    const service = new FincraSandboxService(
      config(configured),
      { fincraSandboxClient: jest.fn(() => client) } as any,
    );

    await service.probeReadOnly();

    expect(client.request).toHaveBeenCalledTimes(5);
    const calls = client.request.mock.calls as unknown as Array<
      [{ method: string; url: string }]
    >;
    expect(calls.every(([arg]) => arg.method === 'GET')).toBe(true);
    expect(
      calls.map(([arg]) => `${arg.method} ${arg.url}`),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/POST|PUT|PATCH|DELETE/),
        expect.stringMatching(/POST .*virtual-accounts\/requests/),
        expect.stringMatching(/POST .*payout/i),
        expect.stringMatching(/POST .*conversion/i),
      ]),
    );
  });

  it.each([
    [401, 'Fincra sandbox authentication failed.'],
    [403, 'Fincra sandbox authorization failed.'],
    [500, 'Fincra sandbox returned a server error.'],
  ])('sanitizes provider %s errors', async (status, expectedMessage) => {
    const client = {
      request: jest.fn(async () => {
        throw {
          code: 'ERR_BAD_RESPONSE',
          message: 'raw provider failure containing account 1234567890',
          response: {
            status,
            data: {
              message: 'token sk_test_secret account 1234567890',
              accountNumber: '1234567890',
              request_id: 'req_123',
            },
          },
        };
      }),
    };
    const service = new FincraSandboxService(
      config(configured),
      { fincraSandboxClient: jest.fn(() => client) } as any,
    );

    const result = await service.probeReadOnly();

    expect(result.endpoints[0]).toEqual(
      expect.objectContaining({
        status,
        ok: false,
        message: expectedMessage,
      }),
    );
    expect(JSON.stringify(result)).not.toContain('sk_test_secret');
    expect(JSON.stringify(result)).not.toContain('1234567890');
  });
});
