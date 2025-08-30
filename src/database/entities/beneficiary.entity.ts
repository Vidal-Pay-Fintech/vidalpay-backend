import { Entity, Column } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity('beneficiary')
export class BeneficiaryEntity extends AbstractEntity {
  @Column({})
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string;

  @Column({ type: 'varchar', nullable: true })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  tagId: string;

  @Column({ type: 'varchar', nullable: true })
  email: string;
}
