import { AccessTokenGuard } from './access-token.guard';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtTokenType } from 'src/iam/interfaces/jwt-token.interface';

describe('AccessTokenGuard', () => {
  const config = {
    secret: 'test-secret',
    refreshSecret: 'test-refresh-secret',
    audience: 'test-audience',
    issuer: 'test-issuer',
    accessTokenTtl: 3600,
    refreshTokenTtl: 86400,
  };

  const contextFor = (authorization: string) => {
    const request = { headers: { authorization } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  it('accepts an explicitly typed access token', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-id',
        email: 'user@example.com',
        role: 'Customer',
        sid: 'session-id',
        familyId: 'family-id',
        tokenType: JwtTokenType.ACCESS,
      }),
    } as unknown as JwtService;
    const sessions = {
      isSessionActive: jest.fn().mockResolvedValue(true),
    };
    const guard = new AccessTokenGuard(jwtService, config, sessions as any);
    const { context, request } = contextFor('Bearer access-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as any).user).toMatchObject({
      sub: 'user-id',
      tokenType: JwtTokenType.ACCESS,
    });
  });

  it('rejects a refresh token at a bearer-protected endpoint', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-id',
        sid: 'session-id',
        familyId: 'family-id',
        tokenType: JwtTokenType.REFRESH,
      }),
    } as unknown as JwtService;
    const guard = new AccessTokenGuard(jwtService, config, {} as any);
    const { context } = contextFor('Bearer refresh-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an access token whose database session was revoked', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-id',
        email: 'user@example.com',
        role: 'Customer',
        sid: 'session-id',
        familyId: 'family-id',
        tokenType: JwtTokenType.ACCESS,
      }),
    } as unknown as JwtService;
    const sessions = {
      isSessionActive: jest.fn().mockResolvedValue(false),
    };
    const guard = new AccessTokenGuard(jwtService, config, sessions as any);
    const { context } = contextFor('Bearer revoked-access-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
