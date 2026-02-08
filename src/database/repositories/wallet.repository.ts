import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from 'src/database/abstract.repository';
import { Wallet } from '../entities/wallet.entity';
// import { API_MESSAGES } from 'src/utils/apiMessages';
// import {
//   PageOptionsDto,
//   ReportRange,
// } from 'src/common/pagination/pageOptionsDto.dto';

@Injectable()
export class WalletRepository extends AbstractRepository<Wallet> {
  protected readonly logger = new Logger(WalletRepository.name);

  constructor(
    @InjectRepository(Wallet)
    protected readonly walletEntityRepository: Repository<Wallet>,
  ) {
    super(walletEntityRepository);
  }
}
