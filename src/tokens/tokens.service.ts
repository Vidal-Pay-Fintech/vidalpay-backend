import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../database/entities/token.entity';

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

  async delete(tokenId: string): Promise<void> {
    await this.tokenRepository.delete(tokenId);
  }
}
