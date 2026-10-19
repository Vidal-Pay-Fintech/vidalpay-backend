import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { SupportTicket } from './support-ticket.entity';

@Entity('support_message')
@Index(['ticketId', 'createdAt'])
export class SupportMessage extends AbstractEntity {
  @Column()
  ticketId: string;

  @Column()
  userId: string;

  @Column({ default: 'CUSTOMER' })
  authorType: string;

  @Column()
  authorId: string;

  @Column({ type: 'text' })
  message: string;

  @ManyToOne(() => SupportTicket)
  ticket: SupportTicket;
}
