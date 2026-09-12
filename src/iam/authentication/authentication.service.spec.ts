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
import { User } from 'src/database/entities/user.entity';
import { PhoneService } from 'src/mail/phone.service';
import jwtConfig from '../config/jwt.config';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  const userRepository = {
    findUserById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const hashingService = { hash: jest.fn(), compare: jest.fn() };
  const tokenService = {
    create: jest.fn(),
    findOneByTokenAndValidate: jest.fn(),
    delete: jest.fn(),
  };
  const mailService = { sendResetTransactionPinCode: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: HashingService, useValue: hashingService },
        { provide: JwtService, useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() } },
        { provide: TokensService, useValue: tokenService },
        { provide: WalletService, useValue: {} },
        { provide: MailService, useValue: mailService },
        { provide: UserRepository, useValue: userRepository },
        { provide: getRepositoryToken(AuthSession), useValue: { find: jest.fn(), findOne: jest.fn(), update: jest.fn(), create: jest.fn(), save: jest.fn() } },
        { provide: PhoneService, useValue: {} },
        { provide: jwtConfig.KEY, useValue: { secret: 'secret', audience: 'audience', issuer: 'issuer' } },
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

  it('creates and emails transaction PIN reset OTPs', async () => {
    userRepository.findUserById.mockResolvedValue({ id: 'user-1' });
    tokenService.create.mockResolvedValue({ id: 'token-1' });

    await service.requestTransactionPinReset('user-1');

    expect(tokenService.create).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 'user-1' } }));
    expect(mailService.sendResetTransactionPinCode).toHaveBeenCalledWith('user-1', expect.any(String));
  });
});