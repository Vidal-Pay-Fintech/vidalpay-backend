import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Token } from '../database/entities/token.entity';
import { TokenType } from 'src/common/enum/token-type.enum';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  async create(tokenData: Partial<Token>): Promise<Token> {
    const token = this.tokenRepository.create(tokenData);
    return this.tokenRepository.save(token);
  }

  async findOneByToken(token: string): Promise<Token | null> {
    return this.tokenRepository.findOne({
      where: { token },
      relations: ['user'],
    });
  }

  // New method: Find and validate token with type, user, and expiration checks
  async findOneByTokenAndValidate(
    tokenValue: string,
    tokenType: TokenType,
    userId: string,
  ): Promise<Token | null> {
    return this.tokenRepository.findOne({
      where: {
        token: tokenValue,
        type: tokenType,
        user: { id: userId },
        expiration: MoreThan(new Date()), // Token must not be expired
      },
      relations: ['user'],
    });
  }

  // Alternative method: Find token and manually check if it's valid
  async findTokenAndCheckValidity(
    tokenValue: string,
    tokenType: TokenType,
    userId: string,
  ): Promise<{ token: Token | null; isValid: boolean }> {
    const token = await this.tokenRepository.findOne({
      where: {
        token: tokenValue,
        type: tokenType,
        user: { id: userId },
      },
      relations: ['user'],
    });

    if (!token) {
      return { token: null, isValid: false };
    }

    const isValid = token.expiration > new Date();
    return { token, isValid };
  }

  async delete(tokenId: string): Promise<void> {
    await this.tokenRepository.delete(tokenId);
  }

  // Optional: Delete all expired tokens (cleanup method)
  async deleteExpiredTokens(): Promise<void> {
    await this.tokenRepository.delete({
      expiration: MoreThan(new Date()),
    });
  }

  // Optional: Delete all tokens for a specific user and type
  async deleteTokensByUserAndType(
    userId: string,
    tokenType: TokenType,
  ): Promise<void> {
    await this.tokenRepository.delete({
      user: { id: userId },
      type: tokenType,
    });
  }
}
