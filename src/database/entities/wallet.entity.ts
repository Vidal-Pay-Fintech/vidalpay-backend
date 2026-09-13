import { User } from 'src/database/entities/user.entity';
import { Column, Entity, Index, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { Currency } from 'src/utils/enums/wallet.enum';
import { FinancialTransaction } from './financial-transaction.entity';

@Entity()
@Index(['userId', 'currency'], { unique: true })
export class Wallet extends AbstractEntity {
  @Column({})
  userId: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  balance: number;

  @Column({ type: 'boolean', default: false })
  withdrawalSuspended: boolean;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: false,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({ type: 'varchar', nullable: true })
  accountNumber: string;

  @Column({ type: 'varchar', nullable: true })
  routingNumber: string;

  @Column({ type: 'varchar', nullable: true })
  accountName: string;

  @Column({ type: 'varchar', nullable: true })
  bankName: string;

  @Column({ type: 'varchar', nullable: true })
  sortCode: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
    select: false,
    insert: false,
    update: false,
  })
  availableBalance: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
    select: false,
    insert: false,
    update: false,
  })
  ledgerBalance: number;

  @Column({
    type: 'text',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  address: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  provider: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  providerCustomerId: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  providerAccountId: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  providerVirtualAccountId: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  providerStatus: string;

  @Column({
    type: 'varchar',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  providerReference: string;

  @Column({
    type: 'simple-json',
    nullable: true,
    select: false,
    insert: false,
    update: false,
  })
  metadata: Record<string, unknown>;

  @ManyToOne(() => User, (user) => user.wallet)
  user: User;

  @OneToMany(() => FinancialTransaction, (transaction) => transaction.wallet)
  transactions: FinancialTransaction[];
}
