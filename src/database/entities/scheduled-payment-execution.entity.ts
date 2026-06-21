import { Column, Entity, Index } from 'typeorm';
import { ScheduledExecutionStatus } from 'src/scheduled-payments/scheduled-payment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'scheduled_payment_execution' })
@Index('UQ_scheduled_execution_occurrence', ['scheduleId', 'scheduledFor'], {
  unique: true,
})
export class ScheduledPaymentExecution extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_scheduled_execution_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_scheduled_execution_scheduleId')
  scheduleId: string;

  @Column({ type: 'timestamp' })
  scheduledFor: Date;

  @Column({ type: 'enum', enum: ScheduledExecutionStatus })
  status: ScheduledExecutionStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionReference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true, select: false })
  failureReason: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  responsePayload: Record<string, unknown> | null;
}
