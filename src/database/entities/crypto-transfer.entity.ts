import { Column, Entity, Index } from 'typeorm';
import {
  CryptoAsset,
  CryptoTransferStatus,
  CryptoTransferType,
} from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_transfer' })
@Index('UQ_crypto_transfer_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class CryptoTransfer extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_crypto_transfer_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: CryptoTransferType })
  type: CryptoTransferType;

  @Column({ type: 'enum', enum: CryptoAsset })
  asset: CryptoAsset;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', nullable: true })
  network: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  transactionHash: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'enum', enum: CryptoTransferStatus })
  status: CryptoTransferStatus;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
