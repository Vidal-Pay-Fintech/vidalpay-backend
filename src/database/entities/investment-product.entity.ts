import { Column, Entity, Index } from 'typeorm';
import { InvestmentRiskLevel } from 'src/investments/investment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'investment_product' })
export class InvestmentProduct extends AbstractEntity {
  @Column({ type: 'varchar', unique: true })
  @Index('IDX_investment_product_providerProductId')
  providerProductId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'enum', enum: InvestmentRiskLevel })
  riskLevel: InvestmentRiskLevel;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  minimumAmount: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
