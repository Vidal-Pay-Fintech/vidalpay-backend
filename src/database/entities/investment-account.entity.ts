import { Column, Entity, Index } from 'typeorm';
import { InvestmentAccountStatus } from 'src/investments/investment.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'investment_account' })
export class InvestmentAccount extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_investment_account_userId')
  userId: string;

  @Column({ type: 'enum', enum: InvestmentAccountStatus })
  status: InvestmentAccountStatus;

  @Column({ type: 'varchar', length: 50, default: 'Cowrywise' })
  provider: string;

  @Column({ type: 'varchar', nullable: true })
  providerAccountId: string | null;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;
}
