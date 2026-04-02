import { User } from 'src/database/entities/user.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { Currency } from 'src/utils/enums/wallet.enum';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';

@Entity()
export class Wallet extends AbstractEntity {
  @Column({})
  userId: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  balance: number;

  @Column({ type: 'boolean', default: false })
  withdrawalSuspended: boolean;

  @Column({ type: 'boolean', default: true })
  receiveEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  transferEnabled: boolean;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: false,
    default: Currency.USD,
  })
  currency: Currency;

  @Column({ nullable: true })
  accountNumber: string;

  @Column({ nullable: true })
  routingNumber: string;

  @Column({ nullable: true })
  accountName: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  sortCode: string;

  @Column({ length: 2, nullable: true })
  routingRegionCode: string | null;

  @Column({
    type: 'enum',
    enum: KycProvider,
    nullable: true,
  })
  routingProvider: KycProvider | null;

  @Column({ nullable: true })
  providerCustomerId: string | null;

  @Column({ nullable: true })
  providerAccountId: string | null;

  @Column({ nullable: true })
  providerVirtualAccountId: string | null;

  @Column({ nullable: true })
  providerReference: string | null;

  @Column({ type: 'simple-json', nullable: true })
  providerMetadata: Record<string, any> | null;

  @ManyToOne(() => User, (user) => user.wallet)
  user: User;
}
