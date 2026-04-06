import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { ProviderWebhookEventStatus } from 'src/common/enum/provider-operation.enum';
import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'provider_webhook_event' })
@Index('UQ_provider_webhook_event_provider_reference', ['provider', 'eventReference'], {
  unique: true,
})
export class ProviderWebhookEvent extends AbstractEntity {
  @Column({
    type: 'enum',
    enum: KycProvider,
  })
  provider: KycProvider;

  @Column({ type: 'varchar' })
  eventType: string;

  @Column({ type: 'varchar', nullable: true })
  @Index('IDX_provider_webhook_event_reference')
  eventReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  operationReference: string | null;

  @Column({
    type: 'enum',
    enum: ProviderWebhookEventStatus,
    default: ProviderWebhookEventStatus.RECEIVED,
  })
  status: ProviderWebhookEventStatus;

  @Column({ type: 'simple-json', nullable: true })
  payload: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date | null;
}
