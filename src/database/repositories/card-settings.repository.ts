import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CardSettings } from 'src/database/entities/card-settings.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class CardSettingsRepository extends AbstractRepository<CardSettings> {
  protected readonly logger = new Logger(CardSettingsRepository.name);

  constructor(
    @InjectRepository(CardSettings)
    protected readonly cardSettingsEntityRepository: Repository<CardSettings>,
  ) {
    super(cardSettingsEntityRepository);
  }

  findByCard(cardId: string) {
    return this.cardSettingsEntityRepository.findOne({ where: { cardId } });
  }
}
