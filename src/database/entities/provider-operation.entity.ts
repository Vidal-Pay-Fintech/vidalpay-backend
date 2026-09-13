import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

const amountTransformer = {
  to: (value?: number | string | null) => value ?? null,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('provider_operation')
@Index(['userId', 'type', 'idempotencyKey'], { unique: true })
@Index(['reference'], { unique: true })
export class ProviderOperation extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  idempotencyKey: string;

  @Column()
  reference: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    transformer: amountTransformer,
  })
  amount: number | null;

  @Column({ type: 'varchar', nullable: true })
  currency: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  requestPayload: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  responsePayload: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.providerOperations)
  user: User;
}
