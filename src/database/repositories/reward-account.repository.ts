import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardAccount } from 'src/database/entities/reward-account.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class RewardAccountRepository extends AbstractRepository<RewardAccount> {
  protected readonly logger = new Logger(RewardAccountRepository.name);

  constructor(
    @InjectRepository(RewardAccount)
    protected readonly rewardAccountEntityRepository: Repository<RewardAccount>,
  ) {
    super(rewardAccountEntityRepository);
  }

  findByUserId(userId: string) {
    return this.rewardAccountEntityRepository.findOne({ where: { userId } });
  }
}
