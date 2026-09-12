import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';
import { Wallet } from './wallet.entity';

const amountTransformer = {
  to: (value?: number | string | null) => value ?? 0,
  from: (value?: string | number | null) => Number(value ?? 0),
};

@Entity('financial_transaction')
@Index(['userId', 'currency'])
@Index(['reference'], { unique: true })
export class FinancialTransaction extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ nullable: true })
  walletId: string | null;

  @Column({ unique: true })
  reference: string;

  @Column({ nullable: true })
  operationReference: string | null;

  @Column()
  currency: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    transformer: amountTransformer,
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: amountTransformer,
  })
  balanceBefore: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: amountTransformer,
  })
  balanceAfter: number;

  @Column()
  type: 'credit' | 'debit';

  @Column({ default: 'SUCCESS' })
  status: string;

  @Column({ default: 'Transaction' })
  info: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ nullable: true })
  tag: string | null;

  @Column({ nullable: true })
  provider: string | null;

  @Column({ nullable: true })
  providerReference: string | null;

  @Column({ nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.transactions)
  user: User;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  wallet: Wallet;
}
