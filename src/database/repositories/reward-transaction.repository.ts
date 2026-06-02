import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RewardTransaction } from 'src/database/entities/reward-transaction.entity';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../abstract.repository';

@Injectable()
export class RewardTransactionRepository extends AbstractRepository<RewardTransaction> {
  protected readonly logger = new Logger(RewardTransactionRepository.name);

  constructor(
    @InjectRepository(RewardTransaction)
    protected readonly rewardTransactionEntityRepository: Repository<RewardTransaction>,
  ) {
    super(rewardTransactionEntityRepository);
  }

  findForUser(userId: string) {
    return this.rewardTransactionEntityRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
