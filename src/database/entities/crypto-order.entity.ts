import { Column, Entity, Index } from 'typeorm';
import {
  CryptoAsset,
  CryptoOrderSide,
  CryptoOrderStatus,
  CryptoOrderType,
} from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_order' })
@Index('UQ_crypto_order_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class CryptoOrder extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_crypto_order_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'varchar', nullable: true })
  providerOrderId: string | null;

  @Column({ type: 'enum', enum: CryptoOrderSide })
  side: CryptoOrderSide;

  @Column({ type: 'enum', enum: CryptoOrderType })
  orderType: CryptoOrderType;

  @Column({ type: 'enum', enum: CryptoAsset })
  asset: CryptoAsset;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  quoteAsset: string;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  quantity: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  limitPrice: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  executedQuantity: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  averagePrice: string | null;

  @Column({ type: 'enum', enum: CryptoOrderStatus })
  status: CryptoOrderStatus;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
