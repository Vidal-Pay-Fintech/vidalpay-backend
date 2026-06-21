import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { PushPlatform } from 'src/notifications/push-notification.enums';

@Entity({ name: 'device_token' })
@Index('UQ_device_token_token', ['token'], { unique: true })
export class DeviceToken extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_device_token_userId')
  userId: string;

  @Column({ type: 'varchar', length: 255, select: false })
  token: string;

  @Column({ type: 'enum', enum: PushPlatform, nullable: true })
  platform: PushPlatform | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  appVersion: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  metadata: Record<string, any> | null;
}
