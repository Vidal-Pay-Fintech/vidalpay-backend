import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { Token } from 'src/database/entities/token.entity';
import { TokenType } from 'src/common/enum/token-type.enum';

describe('TokensService', () => {
  let service: TokensService;
  const tokenRepository = {
    create: jest.fn((payload) => ({ id: 'token-id', ...payload })),
    save: jest.fn(async (payload) => payload),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokensService,
        { provide: getRepositoryToken(Token), useValue: tokenRepository },
      ],
    }).compile();

    service = module.get<TokensService>(TokensService);
  });

  it('persists created tokens through the repository', async () => {
    const token = await service.create({ token: '123456', type: TokenType.VERIFICATION });

    expect(tokenRepository.create).toHaveBeenCalledWith({ token: '123456', type: TokenType.VERIFICATION });
    expect(tokenRepository.save).toHaveBeenCalledWith(expect.objectContaining({ token: '123456' }));
    expect(token).toEqual(expect.objectContaining({ token: '123456' }));
  });

  it('looks up valid tokens by value, type, user, and future expiration', async () => {
    await service.findOneByTokenAndValidate('123456', TokenType.PASSWORD_RESET, 'user-1');

    expect(tokenRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ token: '123456', type: TokenType.PASSWORD_RESET, user: { id: 'user-1' } }),
        relations: ['user'],
      }),
    );
  });
});