import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

const pointsTransformer = {
  to: (value?: number | string | null) => value ?? 0,
  from: (value?: string | number | null) => Number(value ?? 0),
};

@Entity('reward_ledger_entry')
@Index(['userId', 'status'])
@Index(['reference'], { unique: true })
export class RewardLedgerEntry extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  type: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    transformer: pointsTransformer,
  })
  points: number;

  @Column({ default: 'POINTS' })
  unit: string;

  @Column({ type: 'varchar', nullable: true })
  currency: string | null;

  @Column({ default: 'POSTED' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  @Column({ unique: true })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  relatedReference: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'timestamp', nullable: true })
  postedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.rewardLedgerEntries)
  user: User;
}
