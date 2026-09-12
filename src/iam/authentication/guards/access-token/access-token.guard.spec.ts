import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessTokenGuard } from './access-token.guard';
import { REQUEST_USER_KEY } from 'src/iam/iam.constants';

const executionContext = (request: Record<string, any>) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as any;

describe('AccessTokenGuard', () => {
  it('verifies bearer tokens and stores the active user payload', async () => {
    const jwtService = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1' }) } as unknown as JwtService;
    const guard = new AccessTokenGuard(jwtService, { secret: 'secret' } as any);
    const request = { headers: { authorization: 'Bearer token' } };

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('token', { secret: 'secret' });
    expect(request[REQUEST_USER_KEY]).toEqual({ sub: 'user-1' });
  });

  it('rejects requests without bearer tokens', async () => {
    const guard = new AccessTokenGuard({ verifyAsync: jest.fn() } as any, {} as any);

    await expect(
      guard.canActivate(executionContext({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});