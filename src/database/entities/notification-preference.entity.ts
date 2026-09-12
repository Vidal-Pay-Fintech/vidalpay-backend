import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('notification_preference')
@Index(['userId'], { unique: true })
export class NotificationPreference extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ type: 'simple-json', nullable: true })
  channels: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  categories: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  preferences: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.notificationPreferences)
  user: User;
}
