import { Column, Entity, Index } from 'typeorm';
import { CryptoAccountStatus } from 'src/crypto/crypto.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'crypto_account' })
export class CryptoAccount extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_crypto_account_userId')
  userId: string;

  @Column({ type: 'enum', enum: CryptoAccountStatus })
  status: CryptoAccountStatus;

  @Column({ type: 'varchar', length: 50, default: 'Zero Hash' })
  provider: string;

  @Column({ type: 'varchar', nullable: true })
  providerAccountId: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;
}
