import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/database/entities/user.entity';
import { IsEnum } from 'class-validator';
import { TokenType } from 'src/common/enum/token-type.enum';
import { AbstractEntity } from '../abstract.entity';

@Entity()
export class Token extends AbstractEntity {
  @Column()
  token: string;

  @Column({ type: 'timestamp' })
  expiration: Date;

  @Column({
    type: 'enum',
    enum: TokenType,
    nullable: false,
    default: TokenType.PHONE_VERIFICATION,
  })
  type: TokenType;

  @ManyToOne(() => User, (user) => user.tokens)
  user: User;
}
