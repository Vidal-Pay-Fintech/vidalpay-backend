import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  FROZEN = 'FROZEN',
  DISABLED = 'DISABLED',
}

@Entity({ name: 'card' })
export class Card extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_userId')
  userId: string;

  @Column({
    type: 'enum',
    enum: Currency,
  })
  currency: Currency;

  @Column({
    type: 'enum',
    enum: CardStatus,
    default: CardStatus.PENDING,
  })
  status: CardStatus;

  @Column({ type: 'float', precision: 20, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'float', precision: 20, scale: 2, default: 0 })
  availableBalance: number;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({
    type: 'enum',
    enum: KycProvider,
    nullable: true,
  })
  provider: KycProvider | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  lastFour: string | null;

  @Column({ type: 'varchar', length: 40, default: 'VIRTUAL' })
  cardType: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cardName: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
