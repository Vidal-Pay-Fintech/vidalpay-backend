import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { RewardLedgerEntry } from './reward-ledger-entry.entity';
import { User } from './user.entity';

@Entity('referral_event')
@Index(['referrerUserId', 'status'])
@Index(['referrerUserId', 'idempotencyKey'], { unique: true })
@Index(['referralCode'])
@Index(['reference'], { unique: true })
export class ReferralEvent extends AbstractEntity {
  @Column()
  referrerUserId: string;

  @Column({ type: 'varchar', nullable: true })
  referredUserId: string | null;

  @Column()
  referralCode: string;

  @Column({ type: 'varchar', nullable: true })
  inviteeEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  inviteePhoneNumber: string | null;

  @Column({ default: 'INVITED' })
  status: string;

  @Column()
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  rewardLedgerEntryId: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.referralEvents)
  referrer: User;

  @ManyToOne(() => User, { nullable: true })
  referredUser: User | null;

  @ManyToOne(() => RewardLedgerEntry, { nullable: true })
  rewardLedgerEntry: RewardLedgerEntry | null;
}
