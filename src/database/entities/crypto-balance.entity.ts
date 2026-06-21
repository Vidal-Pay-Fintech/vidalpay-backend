import { Column, Entity, Index } from 'typeorm';
import { CryptoAsset } from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_balance' })
@Index('UQ_crypto_balance_account_asset', ['accountId', 'asset'], {
  unique: true,
})
export class CryptoBalance extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_crypto_balance_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'enum', enum: CryptoAsset })
  asset: CryptoAsset;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  available: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  held: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;
}
