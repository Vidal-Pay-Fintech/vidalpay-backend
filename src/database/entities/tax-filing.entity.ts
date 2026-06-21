import { Column, Entity, Index } from 'typeorm';
import { TaxFilingStatus } from 'src/tax/tax.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'tax_filing' })
@Index('UQ_tax_filing_user_year', ['userId', 'taxYear'], { unique: true })
@Index('UQ_tax_filing_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class TaxFiling extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_tax_filing_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'int' })
  taxYear: number;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: TaxFilingStatus })
  status: TaxFilingStatus;

  @Column({ type: 'varchar', nullable: true })
  providerFilingId: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  estimatedRefund: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  estimatedAmountDue: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, select: false })
  providerSessionUrl: string | null;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  providerUpdatedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
