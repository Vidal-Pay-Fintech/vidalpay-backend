import { Column, Entity, Index } from 'typeorm';
import {
  InvestmentFundingStatus,
  InvestmentFundingType,
} from 'src/investments/investment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'investment_funding' })
@Index('UQ_investment_funding_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class InvestmentFunding extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_investment_funding_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: InvestmentFundingType })
  type: InvestmentFundingType;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'enum', enum: InvestmentFundingStatus })
  status: InvestmentFundingStatus;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
