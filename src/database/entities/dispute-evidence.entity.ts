import { Column, Entity, Index } from 'typeorm';
import { EvidenceType } from 'src/disputes/dispute.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'dispute_evidence' })
@Index('UQ_dispute_evidence_case_checksum', ['disputeId', 'checksumSha256'], {
  unique: true,
})
export class DisputeEvidence extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_dispute_evidence_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  disputeId: string;

  @Column({ type: 'enum', enum: EvidenceType })
  type: EvidenceType;

  @Column({ type: 'varchar', length: 255, select: false })
  storageKey: string;

  @Column({ type: 'char', length: 64 })
  checksumSha256: string;

  @Column({ type: 'varchar', length: 100 })
  contentType: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string | null;
}
