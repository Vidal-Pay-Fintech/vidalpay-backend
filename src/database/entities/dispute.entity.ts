import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

const amountTransformer = {
  to: (value?: number | string | null) => value ?? null,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : Number(value),
};

@Entity('dispute')
@Index(['userId', 'idempotencyKey'], { unique: true })
export class Dispute extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  transactionId: string;

  @Column()
  reason: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
    transformer: amountTransformer,
  })
  disputedAmount: number | null;

  @Column({ type: 'boolean', default: false })
  attestation: boolean;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ default: 'OPEN' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.disputes)
  user: User;
}
