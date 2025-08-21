// import { Role } from 'src/common/enum/role.enum';
// import { Notification } from 'src/notification/entities/notification.entity';

// import { Ticket } from 'src/database/entities/ticket.entity';
import { Token } from 'src/database/entities/token.entity';
// import { Wallet } from './wallet.entity';
// import { Wishlist } from 'src/database/entities/wishlist.entity';
import { Column, Entity, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { Wallet } from './wallet.entity';
// import { Winner } from './winner.entity';
// import { Transaction } from './transaction.entity';
// import { Support } from './support';
// import { WalletModifyLog } from './wallet-modify-log.entity';
// import { Role as RoleDetails } from './role.entity';

// import { PromoRedeem } from './promoRedeem.entity';
// import { Role } from './role.entity';
//

import { UserRole } from 'src/utils/enums/user.enum';

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DEACTIVATED = 'DEACTIVATED',
  SUSPENDED = 'SUSPENDED',
}

export enum AuthType {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  None = 'None',
}

@Entity({ name: 'user' })
export class User extends AbstractEntity {
  @Column({ unique: true, nullable: false })
  email: string;

  @Column({ nullable: false })
  password: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  referralCode: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ nullable: true })
  tagId: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  pin: string;

  @Column({ nullable: true })
  dateOfBirth: string;

  @Column({ nullable: true })
  lastLogin: Date;

  @Column({ nullable: true })
  profilePicture: string;

  //   @OneToMany(() => Wishlist, (wishlist) => wishlist.user, { cascade: true })
  //   wishlists: Wishlist[];

  @OneToMany(() => Token, (token) => token.user)
  tokens: Token[];

  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet[];

  @Column({ nullable: true })
  accountStatus: boolean;

  //   @Column({ type: 'enum', enum: Role, default: Role.REGULAR })
  //   role: Role;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  reasonForDeactivation: string;

  //   @OneToMany(() => Ticket, (ticket) => ticket.owner)
  //   tickets: Ticket[];

  //   @OneToOne(() => Wallet, (wallet) => wallet.user)
  //   wallet: Wallet;

  //   @OneToMany(() => Winner, (winner) => winner.user)
  //   winner: Winner[];

  //   @OneToMany(() => Transaction, (transaction) => transaction.user)
  //   transactions: Transaction[];

  //   @OneToMany(() => Support, (support) => support.user)
  //   support: Support[];

  //   @OneToMany(() => WalletModifyLog, (walletModifyLog) => walletModifyLog.user)
  //   walletModifyLogs: WalletModifyLog[];

  // @OneToMany(() => Payment, (payment) => payment.user)
  // payments: Payment[];

  //   @OneToMany(() => Notification, (notification) => notification.user)
  //   notifications: Notification[];

  //   @ManyToOne(() => RoleDetails, (role) => role.users)
  //   roleInfo: Role;

  // @OneToMany(() => PromoRedeem, (promoRedeem) => promoRedeem.user)
  // promoRedeems: PromoRedeem[];

  @Column({ nullable: true })
  resetToken?: string;

  @Column({ nullable: true })
  resetTokenExpiry?: Date;

  @Column({
    type: 'enum',
    nullable: false,
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  @Column({
    type: 'enum',
    nullable: true,
    enum: AuthType,
    default: AuthType.LOCAL,
  })
  authType: AuthType;
}
