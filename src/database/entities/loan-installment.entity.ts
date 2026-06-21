import { Column, Entity, Index } from 'typeorm';
import { LoanInstallmentStatus } from 'src/loans/loan.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'loan_installment' })
@Index('UQ_loan_installment_loan_number', ['loanId', 'installmentNumber'], {
  unique: true,
})
export class LoanInstallment extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_loan_installment_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  loanId: string;

  @Column({ type: 'int' })
  installmentNumber: number;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  principalDue: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  interestDue: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  feeDue: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  totalDue: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  amountPaid: string;

  @Column({ type: 'enum', enum: LoanInstallmentStatus })
  status: LoanInstallmentStatus;
}
