import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { VaultJournal } from '../entities/vault-journal.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class VaultJournalRepository extends AbstractRepository<VaultJournal> {
  protected readonly logger = new Logger(VaultJournalRepository.name);

  constructor(
    @InjectRepository(VaultJournal)
    protected readonly vaultJournalEntityRepository: Repository<VaultJournal>,
  ) {
    super(vaultJournalEntityRepository);
  }
}
