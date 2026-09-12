import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('notification_device')
@Index(['userId', 'deviceId'])
export class NotificationDevice extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ nullable: true })
  deviceId: string | null;

  @Column({ nullable: true })
  subscriptionId: string | null;

  @Column({ nullable: true })
  token: string | null;

  @Column({ nullable: true })
  pushToken: string | null;

  @Column({ nullable: true })
  provider: string | null;

  @Column({ nullable: true })
  platform: string | null;

  @Column({ nullable: true })
  deviceName: string | null;

  @Column({ nullable: true })
  appVersion: string | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.notificationDevices)
  user: User;
}
