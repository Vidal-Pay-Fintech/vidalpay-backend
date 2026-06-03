import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Card } from 'src/database/entities/card.entity';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class CardRepository extends AbstractRepository<Card> {
  protected readonly logger = new Logger(CardRepository.name);

  constructor(
    @InjectRepository(Card)
    protected readonly cardEntityRepository: Repository<Card>,
  ) {
    super(cardEntityRepository);
  }

  findUserCards(userId: string) {
    return this.cardEntityRepository.find({
      where: { userId },
      order: { currency: 'ASC', createdAt: 'ASC' },
    });
  }

  findUserCardByCurrency(userId: string, currency: Currency) {
    return this.cardEntityRepository.findOne({
      where: { userId, currency },
    });
  }
}
