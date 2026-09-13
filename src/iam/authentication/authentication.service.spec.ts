import { PreconditionFailedException, UnauthorizedException } from '@nestjs/common';
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
  const userRepository = {
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
    findOneByTokenAndValidate: jest.fn(),
    delete: jest.fn(),
  };
  const mailService = {
    sendEmailVerificationCode: jest.fn(),
    sendResetTransactionPinCode: jest.fn(),
  };
  const authSessionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => ({ id: 'session-1', familyId: 'family-1', ...payload })),
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
        { provide: getRepositoryToken(AuthSession), useValue: authSessionRepository },
        { provide: PhoneService, useValue: {} },
        { provide: jwtConfig.KEY, useValue: { secret: 'secret', audience: 'audience', issuer: 'issuer', accessTokenTtl: 3600, refreshAccessTokenTtl: 86400 } },
      ],
    }).compile();

    service = module.get<AuthenticationService>(AuthenticationService);
  });

  it('validates transaction PINs through backend-side hashing', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1', pin: 'hashed-pin' });
    hashingService.compare.mockResolvedValue(true);

    await expect(service.validateTransactionPin('user-1', '1234')).resolves.toBe(true);
    expect(hashingService.compare).toHaveBeenCalledWith('1234', 'hashed-pin');
  });

  it('rejects invalid transaction PINs', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1', pin: 'hashed-pin' });
    hashingService.compare.mockResolvedValue(false);

    await expect(service.validateTransactionPin('user-1', '9999')).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('reauthenticates a locked session with password', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1', password: 'hash' });
    hashingService.compare.mockResolvedValue(true);

    await expect(service.reauth('user-1', { password: 'secret' })).resolves.toEqual({ authenticated: true });
  });

  it('rejects failed password reauthentication', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1', password: 'hash' });
    hashingService.compare.mockResolvedValue(false);

    await expect(service.reauth('user-1', { password: 'bad' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reauthenticates a locked session with either transaction PIN field name', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1', pin: 'hashed-pin' });
    hashingService.compare.mockResolvedValue(true);

    await expect(service.reauth('user-1', { transactionPin: '1234' })).resolves.toEqual({ authenticated: true });
    expect(hashingService.compare).toHaveBeenCalledWith('1234', 'hashed-pin');
  });

  it('creates and emails transaction PIN reset OTPs', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1' });
    tokenService.create.mockResolvedValue({ id: 'token-1' });

    await service.requestTransactionPinReset('user-1');

    expect(tokenService.create).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 'user-1' } }));
    expect(mailService.sendResetTransactionPinCode).toHaveBeenCalledWith('user-1', expect.any(String));
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
      service.signIn({ email: '', phoneNumber: '5551234567', password: 'secret' }),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(userRepository.findUserByPhone).toHaveBeenCalledWith('+15551234567');
  });
});
