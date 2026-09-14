import {
  PreconditionFailedException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
jest.mock('typeorm-transactional', () => ({
  ...jest.requireActual('typeorm-transactional'),
  Transactional:
    () =>
    (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthenticationService } from './authentication.service';
import { HashingService } from '../hashing/hashing.service';
import { TokensService } from 'src/tokens/tokens.service';
import { WalletService } from 'src/wallet/wallet.service';
import { MailService } from 'src/mail/mail.service';
import { UserRepository } from 'src/database/repositories/user.repository';
import { AuthSession } from 'src/database/entities/auth-session.entity';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { PhoneService } from 'src/mail/phone.service';
import jwtConfig from '../config/jwt.config';
import { UserRole } from 'src/utils/enums/user.enum';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  const missingAuthSessionTableError = () =>
    Object.assign(new Error('relation "auth_session" does not exist'), {
      code: '42P01',
      driverError: {
        code: '42P01',
        message: 'relation "auth_session" does not exist',
      },
    });
  const invalidPasswordResetTokenTypeError = () =>
    Object.assign(
      new Error(
        'invalid input value for enum token_type_enum: "password_reset"',
      ),
      {
        code: '22P02',
        driverError: {
          code: '22P02',
          message:
            'invalid input value for enum token_type_enum: "password_reset"',
        },
      },
    );
  const userRepository = {
    findOne: jest.fn(),
    findUserById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    checkUserExistByEmail: jest.fn(),
    create: jest.fn(),
    findUserByEmail: jest.fn(),
    findUserByPhone: jest.fn(),
  };
  const hashingService = { hash: jest.fn(), compare: jest.fn() };
  const jwtService = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const walletService = { createCustomerWallets: jest.fn() };
  const tokenService = {
    create: jest.fn(),
    findOneByToken: jest.fn(),
    findOneByTokenAndType: jest.fn(),
    findOneByTokenAndValidate: jest.fn(),
    delete: jest.fn(),
  };
  const mailService = {
    sendEmailVerificationCode: jest.fn(),
    sendResetPasswordOTP: jest.fn(),
    sendResetTransactionPinCode: jest.fn(),
  };
  const authSessionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({
      id: 'session-1',
      familyId: 'family-1',
      ...payload,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: HashingService, useValue: hashingService },
        { provide: JwtService, useValue: jwtService },
        { provide: TokensService, useValue: tokenService },
        { provide: WalletService, useValue: walletService },
        { provide: MailService, useValue: mailService },
        { provide: UserRepository, useValue: userRepository },
        {
          provide: getRepositoryToken(AuthSession),
          useValue: authSessionRepository,
        },
        { provide: PhoneService, useValue: {} },
        {
          provide: jwtConfig.KEY,
          useValue: {
            secret: 'secret',
            audience: 'audience',
            issuer: 'issuer',
            accessTokenTtl: 3600,
            refreshAccessTokenTtl: 86400,
          },
        },
      ],
    }).compile();

    service = module.get<AuthenticationService>(AuthenticationService);
  });

  it('validates transaction PINs through backend-side hashing', async () => {
    userRepository.findUserById.mockResolvedValue({
      id: 'user-1',
      pin: 'hashed-pin',
    });
    hashingService.compare.mockResolvedValue(true);

    await expect(
      service.validateTransactionPin('user-1', '1234'),
    ).resolves.toBe(true);
    expect(hashingService.compare).toHaveBeenCalledWith('1234', 'hashed-pin');
  });

  it('rejects invalid transaction PINs', async () => {
    userRepository.findUserById.mockResolvedValue({
      id: 'user-1',
      pin: 'hashed-pin',
    });
    hashingService.compare.mockResolvedValue(false);

    await expect(
      service.validateTransactionPin('user-1', '9999'),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('reauthenticates a locked session with password', async () => {
    userRepository.findUserById.mockResolvedValue({
      id: 'user-1',
      password: 'hash',
    });
    hashingService.compare.mockResolvedValue(true);

    await expect(
      service.reauth('user-1', { password: 'secret' }),
    ).resolves.toEqual({ authenticated: true });
  });

  it('rejects failed password reauthentication', async () => {
    userRepository.findUserById.mockResolvedValue({
      id: 'user-1',
      password: 'hash',
    });
    hashingService.compare.mockResolvedValue(false);

    await expect(
      service.reauth('user-1', { password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reauthenticates a locked session with either transaction PIN field name', async () => {
    userRepository.findUserById.mockResolvedValue({
      id: 'user-1',
      pin: 'hashed-pin',
    });
    hashingService.compare.mockResolvedValue(true);

    await expect(
      service.reauth('user-1', { transactionPin: '1234' }),
    ).resolves.toEqual({ authenticated: true });
    expect(hashingService.compare).toHaveBeenCalledWith('1234', 'hashed-pin');
  });

  it('creates and emails transaction PIN reset OTPs', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1' });
    tokenService.create.mockResolvedValue({ id: 'token-1' });

    await service.requestTransactionPinReset('user-1');

    expect(tokenService.create).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'user-1' } }),
    );
    expect(mailService.sendResetTransactionPinCode).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
  });

  it('normalizes US and Nigerian phone numbers without forcing US users into +234', () => {
    expect(
      (service as any).normalizePhoneNumberForRegion(
        '5551234567',
        'US',
        'United States',
      ),
    ).toBe('+15551234567');
    expect(
      (service as any).normalizePhoneNumberForRegion(
        '08012345678',
        'NG',
        'Nigeria',
      ),
    ).toBe('+2348012345678');
  });

  it('creates a real pending signup session with wallets and a delivered verification OTP', async () => {
    hashingService.hash.mockResolvedValue('hashed-password');
    userRepository.create.mockResolvedValue({
      id: 'new-user',
      firstName: 'New',
      lastName: 'Customer',
      email: 'new@example.com',
      phoneNumber: '+15551234567',
      password: 'hashed-password',
      role: UserRole.CUSTOMER,
      isVerified: false,
      status: AccountStatus.ACTIVE,
    });
    tokenService.create.mockResolvedValue({ id: 'verification-token-1' });
    mailService.sendEmailVerificationCode.mockResolvedValue({
      id: 'email-1',
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.signUp({
      firstName: 'New',
      lastName: 'Customer',
      email: 'new@example.com',
      phoneNumber: '5551234567',
      password: 'Strong1!',
      country: 'United States',
      countryCode: 'US',
      residency: 'US',
    });

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.objectContaining({
          id: 'new-user',
          isVerified: false,
        }),
      }),
    );
    expect(result.user).not.toHaveProperty('password');
    expect(walletService.createCustomerWallets).toHaveBeenCalledWith(
      'new-user',
    );
    expect(tokenService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'verification',
        user: expect.objectContaining({ id: 'new-user' }),
      }),
    );
    expect(mailService.sendEmailVerificationCode).toHaveBeenCalledWith(
      'new-user',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('verifies only a live email-verification OTP and reissues a usable session', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      role: UserRole.CUSTOMER,
      isVerified: false,
      status: AccountStatus.ACTIVE,
    } as User;
    tokenService.findOneByTokenAndType.mockResolvedValue({
      id: 'verification-token-1',
      user,
    });
    userRepository.findOneAndUpdate.mockResolvedValue({
      ...user,
      isVerified: true,
    });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(service.verifyUserEmail('123456')).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: expect.objectContaining({ isVerified: true }),
      }),
    );
    expect(tokenService.findOneByTokenAndType).toHaveBeenCalledWith(
      '123456',
      'verification',
    );
    expect(tokenService.delete).toHaveBeenCalledWith('verification-token-1');
  });

  it('finishes account-status validation before issuing login tokens', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      password: 'hashed-password',
      role: UserRole.CUSTOMER,
      isVerified: true,
      status: AccountStatus.SUSPENDED,
    } as User;
    userRepository.findUserByEmail.mockResolvedValue(user);
    hashingService.compare.mockResolvedValue(true);

    await expect(
      service.signIn({ email: user.email, password: 'secret' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('finds US users by local or E.164 phone variants during login', async () => {
    const user = {
      id: 'user-1',
      password: 'hashed-password',
      role: UserRole.CUSTOMER,
      isVerified: true,
      status: AccountStatus.ACTIVE,
      phoneNumber: '+15551234567',
      lastLogin: new Date(),
    };
    userRepository.findUserByPhone.mockImplementation(async (phone: string) =>
      phone === '+15551234567' ? user : null,
    );
    hashingService.compare.mockResolvedValue(true);
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      service.signIn({
        email: '',
        phoneNumber: '5551234567',
        password: 'secret',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(userRepository.findUserByPhone).toHaveBeenCalledWith('+15551234567');
  });

  it('falls back to stateless tokens when the auth session table is missing', async () => {
    authSessionRepository.save.mockRejectedValueOnce(
      missingAuthSessionTableError(),
    );
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      service.generateToken({
        id: 'user-1',
        email: 'user@example.com',
        role: UserRole.CUSTOMER,
      } as User),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        sessionMode: 'stateless',
      }),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.not.objectContaining({ sessionId: expect.any(String) }),
      expect.any(Object),
    );
  });

  it('reports session management as unavailable when the auth session table is missing', async () => {
    authSessionRepository.find.mockRejectedValueOnce(
      missingAuthSessionTableError(),
    );

    await expect(service.getSessions('user-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates and emails password reset OTPs', async () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    userRepository.findUserByEmail.mockResolvedValue(user);
    tokenService.create.mockResolvedValue({ id: 'token-1' });

    await expect(
      service.requestPasswordReset('user@example.com'),
    ).resolves.toBe('Please enter the OTP sent to your email address');
    expect(tokenService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'password_reset',
        user,
      }),
    );
    expect(mailService.sendResetPasswordOTP).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
  });

  it('returns service unavailable when password reset token storage is not compatible', async () => {
    userRepository.findUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    tokenService.create.mockRejectedValueOnce(
      invalidPasswordResetTokenTypeError(),
    );

    await expect(
      service.requestPasswordReset('user@example.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mailService.sendResetPasswordOTP).not.toHaveBeenCalled();
  });

  it('cleans up the password reset OTP when email delivery fails', async () => {
    userRepository.findUserByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    tokenService.create.mockResolvedValue({ id: 'token-1' });
    mailService.sendResetPasswordOTP.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        reason: 'SMTP email delivery is not configured on the backend.',
      }),
    );

    await expect(
      service.requestPasswordReset('user@example.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tokenService.delete).toHaveBeenCalledWith('token-1');
  });
});
