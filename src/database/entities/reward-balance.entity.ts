import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'reward_balance' })
export class RewardBalance extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_reward_balance_userId')
  userId: string;

  @Column({ type: 'varchar', length: 40, default: 'POINTS' })
  balanceType: string;

  @Column({ type: 'int', default: 0 })
  balance: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
