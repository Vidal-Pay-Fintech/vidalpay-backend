import { Column, Entity, Index } from 'typeorm';
import { LoanApplicationStatus, LoanPurpose } from 'src/loans/loan.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'loan_application' })
@Index('UQ_loan_application_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class LoanApplication extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_loan_application_userId')
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  requestedAmount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'int' })
  requestedTermMonths: number;

  @Column({ type: 'enum', enum: LoanPurpose })
  purpose: LoanPurpose;

  @Column({ type: 'enum', enum: LoanApplicationStatus })
  status: LoanApplicationStatus;

  @Column({ type: 'varchar', length: 50 })
  consentVersion: string;

  @Column({ type: 'timestamp' })
  consentedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  providerApplicationId: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  decisionReason: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
