import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CardFunding } from 'src/database/entities/card-funding.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class CardFundingRepository extends AbstractRepository<CardFunding> {
  protected readonly logger = new Logger(CardFundingRepository.name);

  constructor(
    @InjectRepository(CardFunding)
    protected readonly cardFundingEntityRepository: Repository<CardFunding>,
  ) {
    super(cardFundingEntityRepository);
  }
}
