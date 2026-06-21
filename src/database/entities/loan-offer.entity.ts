import { Column, Entity, Index } from 'typeorm';
import { LoanOfferStatus } from 'src/loans/loan.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'loan_offer' })
export class LoanOffer extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_loan_offer_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  applicationId: string;

  @Column({ type: 'varchar', unique: true })
  providerOfferId: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  principal: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'decimal', precision: 12, scale: 8 })
  annualPercentageRate: string;

  @Column({ type: 'int' })
  termMonths: number;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  installmentAmount: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  totalRepayment: string;

  @Column({ type: 'enum', enum: LoanOfferStatus })
  status: LoanOfferStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
