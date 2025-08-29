import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { TransactionType } from 'src/utils/enums/transaction-type.enum';
import { VaultType } from 'src/utils/enums/vault.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { TagType } from 'src/utils/enums/tag.enum';

@Entity('transaction')
export class TransactionEntity extends AbstractEntity {
  @Column({})
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  info: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    nullable: false,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: false,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({
    type: 'enum',
    enum: TagType,
    nullable: false,
  })
  tag: TagType;

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
