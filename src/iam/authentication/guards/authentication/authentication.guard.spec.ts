import { AuthenticationGuard } from './authentication.guard';
import { Reflector } from '@nestjs/core';
import { AccessTokenGuard } from '../access-token/access-token.guard';

describe('AuthenticationGuard', () => {
  it('should be defined', () => {
    const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    const accessTokenGuard = {
      canActivate: jest.fn(),
    } as unknown as AccessTokenGuard;

    expect(new AuthenticationGuard(reflector, accessTokenGuard)).toBeDefined();
  });
});
