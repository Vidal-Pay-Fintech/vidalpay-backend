import { Column, Entity, Index } from 'typeorm';
import { TaxAccountStatus } from 'src/tax/tax.enums';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'tax_account' })
export class TaxAccount extends AbstractEntity {
  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_tax_account_userId')
  userId: string;

  @Column({ type: 'enum', enum: TaxAccountStatus })
  status: TaxAccountStatus;

  @Column({ type: 'varchar', length: 30 })
  provider: string;

  @Column({ type: 'varchar', nullable: true })
  providerAccountId: string | null;

  @Column({ type: 'varchar', length: 2, default: 'US' })
  jurisdiction: string;

  @Column({ type: 'simple-json', nullable: true, select: false })
  metadata: Record<string, unknown> | null;
}
