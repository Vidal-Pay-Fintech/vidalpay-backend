import { RequestLogsMiddleware } from './requestLogs.middleware';

describe('RequestLogsMiddleware credential redaction', () => {
  it('redacts nested credential fields using common naming styles', async () => {
    const requestLogRepository = { create: jest.fn() };
    const middleware = new RequestLogsMiddleware(requestLogRepository as any);
    const next = jest.fn();

    await middleware.use(
      {
        originalUrl: '/api/v1/auth/password-reset/complete',
        method: 'POST',
        body: {
          email: 'user@example.com',
          newPassword: 'Password1!',
          nested: {
            refresh_token: 'refresh-token',
            otp: '123456',
          },
        },
        params: {},
        query: {},
        headers: {},
        ip: '127.0.0.1',
      } as any,
      {} as any,
      next,
    );

    const loggedBody = JSON.parse(
      requestLogRepository.create.mock.calls[0][0].requestBody,
    );
    expect(loggedBody).toEqual({
      email: 'user@example.com',
      newPassword: '*********',
      nested: {
        refresh_token: '*********',
        otp: '*********',
      },
    });
    expect(next).toHaveBeenCalled();
  });
});
