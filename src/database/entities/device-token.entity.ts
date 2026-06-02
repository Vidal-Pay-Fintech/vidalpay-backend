import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'device_token' })
export class DeviceToken extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_device_token_userId')
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  @Index('IDX_device_token_token')
  token: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  platform: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
