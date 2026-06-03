import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardBalance } from 'src/database/entities/reward-balance.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class RewardBalanceRepository extends AbstractRepository<RewardBalance> {
  protected readonly logger = new Logger(RewardBalanceRepository.name);

  constructor(
    @InjectRepository(RewardBalance)
    protected readonly rewardBalanceEntityRepository: Repository<RewardBalance>,
  ) {
    super(rewardBalanceEntityRepository);
  }

  findForUser(userId: string) {
    return this.rewardBalanceEntityRepository.find({
      where: { userId },
      order: { balanceType: 'ASC' },
    });
  }

  findByUserAndType(userId: string, balanceType: string) {
    return this.rewardBalanceEntityRepository.findOne({
      where: { userId, balanceType },
    });
  }
}
