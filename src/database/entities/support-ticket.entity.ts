import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

export enum SupportTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum SupportTicketPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

@Entity({ name: 'support_ticket' })
export class SupportTicket extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_support_ticket_userId')
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 160 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: SupportTicketStatus,
    default: SupportTicketStatus.OPEN,
  })
  status: SupportTicketStatus;

  @Column({
    type: 'enum',
    enum: SupportTicketPriority,
    default: SupportTicketPriority.NORMAL,
  })
  priority: SupportTicketPriority;

  @Column({ type: 'varchar', length: 40, nullable: true })
  preferredChannel: string | null;

  @Column({ type: 'text', nullable: true })
  resolutionSummary: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
