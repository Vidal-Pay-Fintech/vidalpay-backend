import { Column, Entity, Index } from 'typeorm';
import {
  DisputeKind,
  DisputeReason,
  DisputeStatus,
} from 'src/disputes/dispute.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'dispute_case' })
@Index('UQ_dispute_case_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class DisputeCase extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_dispute_case_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_dispute_case_transactionId')
  transactionId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: DisputeKind })
  kind: DisputeKind;

  @Column({ type: 'enum', enum: DisputeReason })
  reason: DisputeReason;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  disputedAmount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: DisputeStatus })
  status: DisputeStatus;

  @Column({ type: 'varchar', length: 50 })
  attestationVersion: string;

  @Column({ type: 'timestamp' })
  attestedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerCaseId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  providerDeadline: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
