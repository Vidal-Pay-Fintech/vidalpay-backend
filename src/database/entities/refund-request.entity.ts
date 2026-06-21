import { Column, Entity, Index } from 'typeorm';
import { RefundStatus } from 'src/disputes/dispute.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'refund_request' })
@Index('UQ_refund_request_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class RefundRequest extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_refund_request_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_refund_request_transactionId')
  transactionId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: RefundStatus })
  status: RefundStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerReference: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  reviewNote: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;
}
