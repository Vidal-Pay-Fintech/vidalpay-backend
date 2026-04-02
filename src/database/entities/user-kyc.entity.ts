import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';
import { KycDocument } from './kyc-document.entity';

export interface KycIdentitySnapshot {
  nin?: string | null;
  bvn?: string | null;
  ssn?: string | null;
  approvedIdentityType?: string | null;
  approvedIdentityValue?: string | null;
  metadata?: Record<string, any> | null;
}

export interface KycAddressSnapshot {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateOrRegion?: string | null;
  postalCode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  metadata?: Record<string, any> | null;
}

export interface KycLivenessSnapshot {
  sessionId?: string | null;
  providerReference?: string | null;
  outcome?: string | null;
  completed?: boolean;
  metadata?: Record<string, any> | null;
}

@Entity({ name: 'user_kyc' })
export class UserKyc extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  userId: string;

  @OneToOne(() => User, (user) => user.kyc)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.NOT_STARTED,
  })
  status: KycStatus;

  @Column({
    type: 'enum',
    enum: KycProvider,
    nullable: true,
  })
  provider: KycProvider | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  countryCode: string | null;

  @Column({ type: 'simple-json', nullable: true })
  identityData: KycIdentitySnapshot | null;

  @Column({ type: 'simple-json', nullable: true })
  addressData: KycAddressSnapshot | null;

  @Column({ type: 'simple-json', nullable: true })
  livenessData: KycLivenessSnapshot | null;

  @Column({ type: 'varchar', nullable: true })
  submissionReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  providerResponse: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  blockedReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @OneToMany(() => KycDocument, (document) => document.kyc)
  documents: KycDocument[];
}
