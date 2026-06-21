import { Column, Entity, Index } from 'typeorm';
import { CryptoAsset } from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_deposit_address' })
@Index(
  'UQ_crypto_deposit_address_user_idempotency',
  ['userId', 'idempotencyKey'],
  { unique: true },
)
export class CryptoDepositAddress extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_crypto_deposit_address_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: CryptoAsset })
  asset: CryptoAsset;

  @Column({ type: 'varchar', length: 50, nullable: true })
  network: string | null;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
