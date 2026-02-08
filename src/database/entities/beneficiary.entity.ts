import { Entity, Column, OneToOne, OneToMany } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { User } from './user.entity';

@Entity('beneficiary')
export class Beneficiary extends AbstractEntity {
  @Column({})
  senderId: string;

  @Column({})
  beneficiaryId: string;

  @OneToMany(() => User, (user) => user.sender)
  sender: User;

  @OneToMany(() => User, (user) => user.recipient)
  recipient: User;

  // @Column({ type: 'varchar', nullable: true })
  // firstName: string;

  // @Column({ type: 'varchar', nullable: true })
  // lastName: string;

  // @Column({ type: 'varchar', nullable: true })
  // tagId: string;

  // @Column({ type: 'varchar', nullable: true })
  // email: string;
}
