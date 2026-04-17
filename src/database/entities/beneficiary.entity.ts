import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

export enum BeneficiaryType {
  INTERNAL_TAG = 'INTERNAL_TAG',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
}

@Entity('beneficiary')
export class Beneficiary extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  senderId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  beneficiaryId: string | null;

  @Column({
    type: 'enum',
    enum: BeneficiaryType,
    default: BeneficiaryType.INTERNAL_TAG,
  })
  type: BeneficiaryType;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', nullable: true })
  tagId: string | null;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: true,
  })
  currency: Currency | null;

  @Column({ type: 'varchar', nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  accountName: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', nullable: true })
  routingNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankCode: string | null;

  @Column({
    type: 'enum',
    enum: KycProvider,
    nullable: true,
  })
  provider: KycProvider | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @ManyToOne(() => User, (user) => user.sender, { nullable: false })
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @ManyToOne(() => User, (user) => user.recipient, { nullable: true })
  @JoinColumn({ name: 'beneficiaryId' })
  recipient: User | null;
}
