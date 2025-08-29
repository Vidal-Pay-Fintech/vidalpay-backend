import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import { VaultType } from 'src/utils/enums/vault.enum';
import { Currency } from 'src/utils/enums/wallet.enum';

@Entity()
export class VaultJournal extends AbstractEntity {
  @Column({})
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    nullable: false,
  })
  transactionType: TransactionType;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: false,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({
    type: 'enum',
    enum: VaultType,
    nullable: false,
  })
  vaultType: VaultType;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  amount: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  balanceBefore: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  balanceAfter: number;
}
