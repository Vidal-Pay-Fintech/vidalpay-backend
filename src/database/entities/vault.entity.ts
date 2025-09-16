import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { VaultType } from 'src/utils/enums/vault.enum';

@Entity()
export class Vault extends AbstractEntity {
  @Column({ type: 'varchar', nullable: true })
  vaultName: string;

  @Column({
    type: 'enum',
    enum: VaultType,
    nullable: false,
  })
  vaultType: VaultType;

  @Column({ type: 'varchar', nullable: true })
  accountNumber: string;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  totalDebit: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  totalCredit: number;

  @Column({
    type: 'float',
    precision: 20,
    scale: 2,
    nullable: true,
    default: 0.0,
  })
  workingBalance: number;
}
