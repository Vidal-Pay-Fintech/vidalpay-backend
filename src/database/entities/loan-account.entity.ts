import { Column, Entity, Index } from 'typeorm';
import { LoanAccountStatus } from 'src/loans/loan.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'loan_account' })
export class LoanAccount extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_loan_account_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  offerId: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  providerLoanId: string | null;

  @Column({ type: 'enum', enum: LoanAccountStatus })
  status: LoanAccountStatus;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  principal: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  outstandingPrincipal: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  accruedInterest: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  totalOutstanding: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'timestamp', nullable: true })
  disbursedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  maturityDate: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
