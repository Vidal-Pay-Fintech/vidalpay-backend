import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

export enum StoredProviderStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SANDBOX = 'SANDBOX',
  COMING_SOON = 'COMING_SOON',
  DISABLED = 'DISABLED',
}

@Entity({ name: 'provider_status' })
export class ProviderStatus extends AbstractEntity {
  @Column({ type: 'varchar', length: 80, unique: true })
  @Index('IDX_provider_status_provider')
  provider: string;

  @Column({
    type: 'enum',
    enum: StoredProviderStatus,
    default: StoredProviderStatus.SANDBOX,
  })
  status: StoredProviderStatus;

  @Column({ type: 'varchar', length: 40, default: 'mock' })
  mode: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
