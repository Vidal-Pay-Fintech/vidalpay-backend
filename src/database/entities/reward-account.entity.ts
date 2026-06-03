import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'reward_account' })
export class RewardAccount extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_reward_account_userId')
  userId: string;

  @Column({ type: 'int', default: 0 })
  pointsBalance: number;

  @Column({ type: 'int', default: 0 })
  lifetimeEarned: number;

  @Column({ type: 'int', default: 0 })
  lifetimeRedeemed: number;

  @Column({ type: 'varchar', length: 40, default: 'DEMO' })
  tier: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
