import { AccessTokenGuard } from './access-token.guard';
import { JwtService } from '@nestjs/jwt';

describe('AccessTokenGuard', () => {
  it('should be defined', () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;

    expect(
      new AccessTokenGuard(jwtService, {
        secret: 'test-secret',
        audience: 'test-audience',
        issuer: 'test-issuer',
        accessTokenTtl: 3600,
        refreshAccessTokenTtl: 86400,
      }),
    ).toBeDefined();
  });
});
