import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('notification')
@Index(['userId', 'read'])
export class Notification extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: 'General' })
  category: string;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.notifications)
  user: User;
}
