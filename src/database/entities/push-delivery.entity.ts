import { Column, Entity, Index } from 'typeorm';
import { PushDeliveryStatus } from 'src/notifications/push-notification.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'push_delivery' })
@Index(
  'UQ_push_delivery_notification_device',
  ['notificationId', 'deviceTokenId'],
  {
    unique: true,
  },
)
@Index('IDX_push_delivery_status_nextAttemptAt', ['status', 'nextAttemptAt'])
export class PushDelivery extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_push_delivery_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_push_delivery_notificationId')
  notificationId: string;

  @Column({ type: 'varchar', length: 36 })
  deviceTokenId: string;

  @Column({ type: 'enum', enum: PushDeliveryStatus })
  status: PushDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamp' })
  nextAttemptAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerReference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'text', nullable: true, select: false })
  failureReason: string | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  providerPayload: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 36, nullable: true, select: false })
  lockToken: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  lockedUntil: Date | null;
}
