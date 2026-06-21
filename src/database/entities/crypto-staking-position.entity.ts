import { Column, Entity, Index } from 'typeorm';
import { CryptoAsset, CryptoStakingStatus } from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_staking_position' })
@Index('UQ_crypto_staking_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class CryptoStakingPosition extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_crypto_staking_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: CryptoAsset })
  asset: CryptoAsset;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  accruedRewards: string;

  @Column({ type: 'enum', enum: CryptoStakingStatus })
  status: CryptoStakingStatus;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
