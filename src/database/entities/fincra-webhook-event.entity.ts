import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity('fincra_webhook_event')
@Index(['provider', 'eventId'], { unique: true })
export class FincraWebhookEvent extends AbstractEntity {
  @Column({ default: 'FINCRA' })
  provider: string;

  @Column()
  eventId: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', nullable: true })
  operationId: string | null;

  @Column({ type: 'varchar', nullable: true })
  status: string | null;

  @Column({ type: 'simple-json', nullable: true })
  payloadSummary: Record<string, unknown> | null;
}
