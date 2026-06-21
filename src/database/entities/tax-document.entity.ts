import { Column, Entity, Index } from 'typeorm';
import { TaxDocumentStatus, TaxDocumentType } from 'src/tax/tax.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'tax_document' })
@Index('UQ_tax_document_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class TaxDocument extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_tax_document_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  filingId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: TaxDocumentType })
  type: TaxDocumentType;

  @Column({ type: 'enum', enum: TaxDocumentStatus })
  status: TaxDocumentStatus;

  @Column({ type: 'varchar', nullable: true })
  providerDocumentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  originalFileName: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  storageReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
