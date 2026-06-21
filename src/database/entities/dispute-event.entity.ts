import { Column, Entity, Index } from 'typeorm';
import { DisputeEventSource, DisputeStatus } from 'src/disputes/dispute.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'dispute_event' })
export class DisputeEvent extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_dispute_event_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_dispute_event_disputeId')
  disputeId: string;

  @Column({ type: 'enum', enum: DisputeStatus, nullable: true })
  previousStatus: DisputeStatus | null;

  @Column({ type: 'enum', enum: DisputeStatus })
  status: DisputeStatus;

  @Column({ type: 'enum', enum: DisputeEventSource })
  source: DisputeEventSource;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  providerEventId: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  note: string | null;
}
