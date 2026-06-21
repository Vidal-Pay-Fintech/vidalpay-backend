import { Column, Entity, Index } from 'typeorm';
import { LoanRepaymentStatus } from 'src/loans/loan.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'loan_repayment' })
@Index('UQ_loan_repayment_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class LoanRepayment extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_loan_repayment_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  loanId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: LoanRepaymentStatus })
  status: LoanRepaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
