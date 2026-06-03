import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

export enum RewardTransactionType {
  EARN = 'EARN',
  REDEEM = 'REDEEM',
}

@Entity({ name: 'reward_transaction' })
export class RewardTransaction extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_reward_transaction_userId')
  userId: string;

  @Column({
    type: 'enum',
    enum: RewardTransactionType,
  })
  type: RewardTransactionType;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'varchar', length: 120 })
  reason: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
