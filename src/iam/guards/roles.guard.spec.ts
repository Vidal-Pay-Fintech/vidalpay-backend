import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from 'src/common/enum/role.enum';
import { JwtTokenType } from '../interfaces/jwt-token.interface';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const contextFor = (role?: Role) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: role
            ? {
                sub: 'user-id',
                email: 'user@example.com',
                role,
                tokenType: JwtTokenType.ACCESS,
              }
            : undefined,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('uses the access payload already validated by the authentication guard', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ADMIN]),
    } as unknown as Reflector;

    await expect(
      new RolesGuard(reflector).canActivate(contextFor(Role.ADMIN)),
    ).resolves.toBe(true);
    await expect(
      new RolesGuard(reflector).canActivate(contextFor(Role.REGULAR)),
    ).resolves.toBe(false);
  });

  it('allows routes that do not declare role requirements', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;

    await expect(
      new RolesGuard(reflector).canActivate(contextFor()),
    ).resolves.toBe(true);
  });
});
