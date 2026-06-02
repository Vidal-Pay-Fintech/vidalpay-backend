import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CardTransaction } from 'src/database/entities/card-transaction.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class CardTransactionRepository extends AbstractRepository<CardTransaction> {
  protected readonly logger = new Logger(CardTransactionRepository.name);

  constructor(
    @InjectRepository(CardTransaction)
    protected readonly cardTransactionEntityRepository: Repository<CardTransaction>,
  ) {
    super(cardTransactionEntityRepository);
  }

  findByCard(cardId: string) {
    return this.cardTransactionEntityRepository.find({
      where: { cardId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
