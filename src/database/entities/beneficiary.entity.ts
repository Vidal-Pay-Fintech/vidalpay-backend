import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('beneficiary')
@Index(['userId', 'currency'])
export class Beneficiary extends AbstractEntity {
  @Column()
  userId: string;

  @Column({ nullable: true })
  name: string | null;

  @Column({ nullable: true })
  firstName: string | null;

  @Column({ nullable: true })
  lastName: string | null;

  @Column({ nullable: true })
  type: string | null;

  @Column({ nullable: true })
  rail: string | null;

  @Column({ nullable: true })
  tagId: string | null;

  @Column({ nullable: true })
  currency: string | null;

  @Column({ nullable: true })
  accountNumber: string | null;

  @Column({ nullable: true })
  accountName: string | null;

  @Column({ nullable: true })
  bankName: string | null;

  @Column({ nullable: true })
  routingNumber: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @ManyToOne(() => User, (user) => user.beneficiaries)
  user: User;
}
