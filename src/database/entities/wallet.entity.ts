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

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  routingNumber: string;

  @Column({ nullable: true })
  accountName: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  sortCode: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  availableBalance: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  ledgerBalance: number;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  provider: string;

  @Column({ nullable: true })
  providerCustomerId: string;

  @Column({ nullable: true })
  providerAccountId: string;

  @Column({ nullable: true })
  providerVirtualAccountId: string;

  @Column({ nullable: true })
  providerStatus: string;

  @Column({ nullable: true })
  providerReference: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown>;

  @ManyToOne(() => User, (user) => user.wallet)
  user: User;

  @OneToMany(() => FinancialTransaction, (transaction) => transaction.wallet)
  transactions: FinancialTransaction[];
}
