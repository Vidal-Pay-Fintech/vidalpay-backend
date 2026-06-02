import { ProviderOperationStatus } from 'src/common/enum/provider-operation.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'card_funding' })
export class CardFunding extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_funding_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_funding_cardId')
  cardId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceWalletId: string | null;

  @Column({ type: 'float', precision: 20, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: Currency,
  })
  sourceCurrency: Currency;

  @Column({
    type: 'enum',
    enum: Currency,
  })
  cardCurrency: Currency;

  @Column({
    type: 'enum',
    enum: ProviderOperationStatus,
    default: ProviderOperationStatus.COMPLETED,
  })
  status: ProviderOperationStatus;

  @Column({ type: 'varchar', nullable: true })
  fxQuoteId: string | null;

  @Column({ type: 'varchar', nullable: true })
  walletTransactionReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  cardTransactionReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  receiptReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
