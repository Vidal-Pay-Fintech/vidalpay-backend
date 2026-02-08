import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Vault } from '../entities/vault.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class VaultRepository extends AbstractRepository<Vault> {
  protected readonly logger = new Logger(VaultRepository.name);

  constructor(
    @InjectRepository(Vault)
    protected readonly vaultEntityRepository: Repository<Vault>,
  ) {
    super(vaultEntityRepository);
  }
}
