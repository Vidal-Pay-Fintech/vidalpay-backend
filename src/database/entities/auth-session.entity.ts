import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('auth_session')
@Index(['userId', 'familyId'])
export class AuthSession extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ unique: true })
  familyId: string;

  @Column({ type: 'longtext', nullable: true })
  refreshTokenHash: string | null;

  @Column({ nullable: true })
  deviceId: string | null;

  @Column({ nullable: true })
  deviceName: string | null;

  @Column({ nullable: true })
  platform: string | null;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @ManyToOne(() => User, (user) => user.sessions)
  user: User;
}
