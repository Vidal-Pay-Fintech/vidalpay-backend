import { ProviderOperationStatus } from 'src/common/enum/provider-operation.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

export enum CardTransactionType {
  FUNDING = 'FUNDING',
  PURCHASE = 'PURCHASE',
  REVERSAL = 'REVERSAL',
}

@Entity({ name: 'card_transaction' })
export class CardTransaction extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_transaction_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_transaction_cardId')
  cardId: string;

  @Column({
    type: 'enum',
    enum: CardTransactionType,
  })
  type: CardTransactionType;

  @Column({
    type: 'enum',
    enum: ProviderOperationStatus,
    default: ProviderOperationStatus.COMPLETED,
  })
  status: ProviderOperationStatus;

  @Column({
    type: 'enum',
    enum: Currency,
  })
  currency: Currency;

  @Column({ type: 'float', precision: 20, scale: 2 })
  amount: number;

  @Column({ type: 'float', precision: 20, scale: 2 })
  balanceBefore: number;

  @Column({ type: 'float', precision: 20, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'varchar' })
  @Index('IDX_card_transaction_reference')
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
