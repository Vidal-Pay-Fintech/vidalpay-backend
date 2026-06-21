import { UnauthorizedException } from '@nestjs/common';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { UserRole } from 'src/utils/enums/user.enum';
import { AuthenticationService } from './authentication.service';

describe('AuthenticationService', () => {
  const createService = (user: Partial<User>) => {
    const hashingService = {
      compare: jest.fn().mockResolvedValue(true),
      hash: jest.fn().mockResolvedValue('hash'),
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    const userRepository = {
      findUserForAuthentication: jest.fn().mockResolvedValue(user),
      findOneAndUpdate: jest.fn().mockResolvedValue(user),
    };
    const refreshSessionRepository = {
      createSession: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
      listActiveForUser: jest.fn().mockResolvedValue([]),
      revokeFamilyForUser: jest.fn().mockResolvedValue(true),
      revokeAllExceptFamily: jest.fn().mockResolvedValue(2),
    };

    const service = new AuthenticationService(
      hashingService as any,
      jwtService as any,
      {} as any,
      {} as any,
      {} as any,
      userRepository as any,
      refreshSessionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        secret: 'test-secret',
        refreshSecret: 'test-refresh-secret',
        audience: 'test-audience',
        issuer: 'test-issuer',
        accessTokenTtl: 3600,
        refreshTokenTtl: 86400,
      },
    );

    return { service, userRepository, refreshSessionRepository };
  };

  const credentialUser = (role: UserRole): Partial<User> => ({
    id: 'user-id',
    email: 'user@example.com',
    password: 'password-hash',
    pin: 'pin-hash',
    resetToken: 'reset-token',
    resetTokenExpiry: new Date(),
    role,
    isVerified: true,
    status: AccountStatus.ACTIVE,
  });

  it('returns a credential-free customer login response', async () => {
    const { service } = createService(credentialUser(UserRole.CUSTOMER));

    const result = await service.signIn({
      email: 'user@example.com',
      password: 'Password1!',
    } as any);

    expect(result.user).not.toHaveProperty('password');
    expect(result.user).not.toHaveProperty('pin');
    expect(result.user).not.toHaveProperty('resetToken');
  });

  it('allows an administrator to use admin login without leaking credentials', async () => {
    const { service } = createService(credentialUser(UserRole.ADMIN));

    const result = await service.adminSignIn({
      email: 'admin@example.com',
      password: 'Password1!',
    } as any);

    expect(result.admin.role).toBe(UserRole.ADMIN);
    expect(result.admin).not.toHaveProperty('password');
    expect(result.admin).not.toHaveProperty('pin');
  });

  it('rejects a customer from the admin login endpoint', async () => {
    const { service } = createService(credentialUser(UserRole.CUSTOMER));

    await expect(
      service.adminSignIn({
        email: 'user@example.com',
        password: 'Password1!',
      } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns safe customer-visible session metadata', async () => {
    const { service, refreshSessionRepository } = createService(
      credentialUser(UserRole.CUSTOMER),
    );
    refreshSessionRepository.listActiveForUser.mockResolvedValue([
      {
        familyId: 'family-id',
        deviceId: 'device-id',
        deviceName: null,
        userAgent:
          'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Safari/604.1',
        ipAddress: '203.0.113.10',
        createdAt: new Date(),
        lastSeenAt: new Date(),
        lastRefreshedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    const sessions = await service.listSessions('user-id', 'family-id');

    expect(sessions[0]).toMatchObject({
      id: 'family-id',
      current: true,
      deviceName: 'iPhone',
      browser: 'Safari',
      operatingSystem: 'iOS',
    });
    expect(sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('revokes every session except the current family', async () => {
    const { service, refreshSessionRepository } = createService(
      credentialUser(UserRole.CUSTOMER),
    );

    const result = await service.revokeOtherSessions('user-id', 'family-id');

    expect(refreshSessionRepository.revokeAllExceptFamily).toHaveBeenCalledWith(
      'user-id',
      'family-id',
    );
    expect(result.revoked).toBe(2);
  });
});
