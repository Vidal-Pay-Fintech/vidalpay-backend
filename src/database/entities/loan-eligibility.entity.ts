import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { LoanEligibilityStatus } from 'src/loans/loan.enums';

@Entity({ name: 'loan_eligibility' })
export class LoanEligibility extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_loan_eligibility_userId')
  userId: string;

  @Column({ type: 'enum', enum: LoanEligibilityStatus })
  status: LoanEligibilityStatus;

  @Column({ type: 'boolean', nullable: true })
  eligible: boolean | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  maximumAmount: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  riskBand: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 50 })
  consentVersion: string;

  @Column({ type: 'timestamp' })
  consentedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  decisionMetadata: Record<string, unknown> | null;
}
