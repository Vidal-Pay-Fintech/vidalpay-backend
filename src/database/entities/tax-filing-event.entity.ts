import { Column, Entity, Index } from 'typeorm';
import { TaxEventSource, TaxFilingStatus } from 'src/tax/tax.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'tax_filing_event' })
export class TaxFilingEvent extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_tax_filing_event_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_tax_filing_event_filingId')
  filingId: string;

  @Column({ type: 'enum', enum: TaxFilingStatus, nullable: true })
  previousStatus: TaxFilingStatus | null;

  @Column({ type: 'enum', enum: TaxFilingStatus })
  status: TaxFilingStatus;

  @Column({ type: 'enum', enum: TaxEventSource })
  source: TaxEventSource;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerEventId: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  metadata: Record<string, unknown> | null;
}
