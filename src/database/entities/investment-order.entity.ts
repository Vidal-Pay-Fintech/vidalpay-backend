import { Column, Entity, Index } from 'typeorm';
import {
  InvestmentOrderStatus,
  InvestmentOrderType,
} from 'src/investments/investment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'investment_order' })
@Index('UQ_investment_order_user_idempotency', ['userId', 'idempotencyKey'], {
  unique: true,
})
export class InvestmentOrder extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_investment_order_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'varchar', nullable: true })
  providerOrderId: string | null;

  @Column({ type: 'enum', enum: InvestmentOrderType })
  type: InvestmentOrderType;

  @Column({ type: 'decimal', precision: 36, scale: 18 })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'enum', enum: InvestmentOrderStatus })
  status: InvestmentOrderStatus;

  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
