import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticationGuard } from './authentication.guard';
import { AuthType } from '../../enums/auth-type.enum';

const context =
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as any);

describe('AuthenticationGuard', () => {
  it('allows routes marked with AuthType.None', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([AuthType.None]) } as unknown as Reflector;
    const accessTokenGuard = { canActivate: jest.fn() };
    const guard = new AuthenticationGuard(reflector, accessTokenGuard as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(accessTokenGuard.canActivate).not.toHaveBeenCalled();
  });

  it('uses the bearer guard by default', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const accessTokenGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    const guard = new AuthenticationGuard(reflector, accessTokenGuard as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(accessTokenGuard.canActivate).toHaveBeenCalledWith(context);
  });

  it('throws when no configured guard authorizes the request', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue([AuthType.Bearer]) } as unknown as Reflector;
    const accessTokenGuard = { canActivate: jest.fn().mockRejectedValue(new UnauthorizedException()) };
    const guard = new AuthenticationGuard(reflector, accessTokenGuard as any);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});