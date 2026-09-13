import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('support_ticket')
@Index(['userId', 'status'])
export class SupportTicket extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ default: 'General' })
  category: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'NORMAL' })
  priority: string;

  @Column({ default: 'OPEN' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  preferredChannel: string | null;

  @Column({ type: 'text', nullable: true })
  resolutionSummary: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.supportTickets)
  user: User;
}
