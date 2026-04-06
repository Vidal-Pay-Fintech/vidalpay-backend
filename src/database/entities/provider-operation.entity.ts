import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import {
  ProviderOperationStatus,
  ProviderOperationType,
} from 'src/common/enum/provider-operation.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'provider_operation' })
export class ProviderOperation extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('IDX_provider_operation_userId')
  userId: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @Index('IDX_provider_operation_walletId')
  walletId: string | null;

  @Column({
    type: 'enum',
    enum: KycProvider,
  })
  provider: KycProvider;

  @Column({ type: 'varchar', length: 2, nullable: true })
  regionCode: string | null;

  @Column({
    type: 'enum',
    enum: ProviderOperationType,
  })
  operationType: ProviderOperationType;

  @Column({
    type: 'enum',
    enum: ProviderOperationStatus,
    default: ProviderOperationStatus.PENDING,
  })
  status: ProviderOperationStatus;

  @Column({ type: 'varchar', nullable: true })
  @Index('IDX_provider_operation_reference')
  reference: string | null;

  @Column({ type: 'varchar', nullable: true })
  externalReference: string | null;

  @Column({
    type: 'enum',
    enum: Currency,
    nullable: true,
  })
  currency: Currency | null;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0,
  })
  amount: number | null;

  @Column({ type: 'simple-json', nullable: true })
  requestPayload: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  responsePayload: Record<string, any> | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reconciledAt: Date | null;
}
