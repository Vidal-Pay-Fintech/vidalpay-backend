import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'notification_preference' })
@Index('UQ_notification_preference_userId', ['userId'], { unique: true })
export class NotificationPreference extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_notification_preference_userId')
  userId: string;

  @Column({ type: 'boolean', default: true })
  inAppEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  emailEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  pushEnabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  topics: Record<string, boolean> | null;
}
