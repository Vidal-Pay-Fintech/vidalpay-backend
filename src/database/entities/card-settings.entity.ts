import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';

@Entity({ name: 'card_settings' })
export class CardSettings extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_card_settings_userId')
  userId: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  @Index('IDX_card_settings_cardId')
  cardId: string;

  @Column({ type: 'boolean', default: true })
  onlinePaymentsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  atmWithdrawalsEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  internationalPaymentsEnabled: boolean;

  @Column({ type: 'float', precision: 20, scale: 2, nullable: true })
  dailySpendLimit: number | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any> | null;
}
