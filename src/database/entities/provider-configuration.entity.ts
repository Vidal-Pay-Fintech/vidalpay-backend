import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'provider_configuration' })
export class ProviderConfiguration extends AbstractEntity {
  @Column({ type: 'varchar', length: 80 })
  @Index('IDX_provider_configuration_provider')
  provider: string;

  @Column({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'varchar', length: 40, default: 'mock' })
  mode: string;

  @Column({ type: 'boolean', default: false })
  encrypted: boolean;

  @Column({ type: 'text', nullable: true })
  value: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
