import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

const amountTransformer = {
  to: (value?: number | string | null) => value ?? 0,
  from: (value?: string | number | null) => Number(value ?? 0),
};

@Entity('card')
@Index(['userId', 'currency'])
export class Card extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  type: string;

  @Column()
  currency: string;

  @Column({ default: 'PENDING' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  maskedPan: string | null;

  @Column({ type: 'varchar', nullable: true })
  last4: string | null;

  @Column({ type: 'varchar', nullable: true })
  expiryMonth: string | null;

  @Column({ type: 'varchar', nullable: true })
  expiryYear: string | null;

  @Column({ type: 'varchar', nullable: true })
  cardholderName: string | null;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: amountTransformer,
  })
  balance: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
    transformer: amountTransformer,
  })
  availableBalance: number;

  @Column({ type: 'simple-json', nullable: true })
  limits: Record<string, unknown> | null;

  @Column({ type: 'simple-json', nullable: true })
  billingAddress: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerCardId: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerStatus: string | null;

  @ManyToOne(() => User, (user) => user.cards)
  user: User;
}
