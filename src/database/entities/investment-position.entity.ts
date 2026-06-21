import { Column, Entity, Index } from 'typeorm';
import { InvestmentPositionStatus } from 'src/investments/investment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'investment_position' })
@Index('UQ_investment_position_account_product', ['accountId', 'productId'], {
  unique: true,
})
export class InvestmentPosition extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_investment_position_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', nullable: true })
  providerPositionId: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  units: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, default: 0 })
  investedAmount: string;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  currentValue: string | null;

  @Column({ type: 'decimal', precision: 36, scale: 18, nullable: true })
  unrealizedReturn: string | null;

  @Column({ type: 'enum', enum: InvestmentPositionStatus })
  status: InvestmentPositionStatus;

  @Column({ type: 'timestamp', nullable: true })
  providerUpdatedAt: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
