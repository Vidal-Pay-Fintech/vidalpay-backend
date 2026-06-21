import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity({ name: 'refresh_session' })
@Index('IDX_refresh_session_user_active', ['userId', 'revokedAt'])
@Index('IDX_refresh_session_family', ['familyId'])
export class RefreshSession extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 36 })
  familyId: string;

  @Column({ type: 'char', length: 64, unique: true, select: false })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reuseDetectedAt: Date | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  replacedBySessionId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, select: false })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'timestamp' })
  lastSeenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRefreshedAt: Date | null;
}
