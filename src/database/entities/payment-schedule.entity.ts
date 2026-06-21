import { Column, Entity, Index } from 'typeorm';
import {
  PaymentScheduleStatus,
  ScheduleFrequency,
  ScheduledTransferType,
} from 'src/scheduled-payments/scheduled-payment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'payment_schedule' })
@Index('UQ_payment_schedule_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class PaymentSchedule extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_payment_schedule_userId')
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: ScheduledTransferType })
  transferType: ScheduledTransferType;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'enum', enum: ScheduleFrequency })
  frequency: ScheduleFrequency;

  @Column({ type: 'enum', enum: PaymentScheduleStatus })
  @Index('IDX_payment_schedule_status_nextRunAt')
  status: PaymentScheduleStatus;

  @Column({ type: 'timestamp' })
  nextRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endAt: Date | null;

  @Column({ type: 'int', nullable: true })
  maxOccurrences: number | null;

  @Column({ type: 'int', default: 0 })
  completedOccurrences: number;

  @Column({ type: 'simple-json', select: false })
  destination: Record<string, unknown>;

  @Column({ type: 'varchar', length: 50 })
  authorizationVersion: string;

  @Column({ type: 'timestamp' })
  authorizedAt: Date;

  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  lockToken: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  lockedUntil: Date | null;
}
