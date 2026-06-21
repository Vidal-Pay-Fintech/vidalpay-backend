import { Column, Entity, Index } from 'typeorm';
import { AdminUserActionType } from 'src/admin/admin-user-management.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'admin_user_action' })
export class AdminUserAction extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_admin_user_action_actorId')
  actorId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_admin_user_action_targetUserId')
  targetUserId: string;

  @Column({ type: 'enum', enum: AdminUserActionType })
  action: AdminUserActionType;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'simple-json', nullable: true, select: false })
  previousState: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true, select: false })
  newState: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, select: false })
  userAgent: string | null;
}
