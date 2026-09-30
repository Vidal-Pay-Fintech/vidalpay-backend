import { ConfigService } from '@nestjs/config';
import { FincraSandboxService } from './fincra-sandbox.service';

const config = (values: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

const configured = {
  FINCRA_API_KEY: 'secret',
  FINCRA_BUSINESS_ID: 'business-1',
};

describe('FincraSandboxService', () => {
  it('does not attempt authenticated probes when required sandbox config is missing', async () => {
    const http = { fincraClient: jest.fn() };
    const service = new FincraSandboxService(config(), http as any);

    const result = await service.probeReadOnly();

    expect(result.ready).toBe(false);
    expect(result.authentication.attempted).toBe(false);
    expect(result.configuration.missingRequired).toEqual([
      'FINCRA_API_KEY',
      'FINCRA_BUSINESS_ID',
    ]);
    expect(http.fincraClient).not.toHaveBeenCalled();
  });

  it('handles missing FINCRA_API_KEY safely', async () => {
    const http = { fincraClient: jest.fn() };
    const service = new FincraSandboxService(
      config({ FINCRA_BUSINESS_ID: 'business-1' }),
      http as any,
    );

    const result = await service.probeReadOnly();

    expect(result.authentication.status).toBe('MISSING_CONFIGURATION');
    expect(result.configuration.missingRequired).toEqual(['FINCRA_API_KEY']);
    expect(http.fincraClient).not.toHaveBeenCalled();
  });

  it('handles missing FINCRA_BUSINESS_ID safely', async () => {
    const http = { fincraClient: jest.fn() };
    const service = new FincraSandboxService(
      config({ FINCRA_API_KEY: 'secret' }),
      http as any,
    );

    const result = await service.probeReadOnly();

    expect(result.authentication.status).toBe('MISSING_CONFIGURATION');
    expect(result.configuration.missingRequired).toEqual(['FINCRA_BUSINESS_ID']);
    expect(http.fincraClient).not.toHaveBeenCalled();
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
      { fincraClient: jest.fn(() => client) } as any,
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
      { fincraClient: jest.fn(() => client) } as any,
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
      { fincraClient: jest.fn(() => client) } as any,
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
