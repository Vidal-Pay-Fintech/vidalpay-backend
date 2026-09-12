import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('kyc_profile')
@Index(['userId'], { unique: true })
export class KycProfile extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ nullable: true })
  region: string | null;

  @Column({ nullable: true })
  provider: string | null;

  @Column({ default: 'NOT_STARTED' })
  status: string;

  @Column({ nullable: true })
  statusMessage: string | null;

  @Column({ nullable: true })
  rejectionReason: string | null;

  @Column({ nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  sections: Record<string, unknown>[] | null;

  @Column({ type: 'simple-json', nullable: true })
  uploads: Record<string, unknown>[] | null;

  @Column({ type: 'simple-json', nullable: true })
  identity: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  capabilities: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  limits: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.kycProfiles)
  user: User;
}
