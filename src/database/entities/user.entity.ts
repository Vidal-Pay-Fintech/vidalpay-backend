// import { Role } from 'src/common/enum/role.enum';
// import { Notification } from 'src/notification/entities/notification.entity';

// import { Ticket } from 'src/database/entities/ticket.entity';
import { Token } from 'src/database/entities/token.entity';
// import { Wallet } from './wallet.entity';
// import { Wishlist } from 'src/database/entities/wishlist.entity';
import { Column, Entity, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { Wallet } from './wallet.entity';
import { AuthSession } from './auth-session.entity';
import { Beneficiary } from './beneficiary.entity';
import { Card } from './card.entity';
import { Dispute } from './dispute.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { KycProfile } from './kyc-profile.entity';
import { Notification } from './notification.entity';
import { NotificationDevice } from './notification-device.entity';
import { NotificationPreference } from './notification-preference.entity';
import { ProviderOperation } from './provider-operation.entity';
import { ReferralEvent } from './referral-event.entity';
import { RewardLedgerEntry } from './reward-ledger-entry.entity';
import { SupportTicket } from './support-ticket.entity';
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

  @Column({ type: 'varchar', nullable: true })
  firstName: string;

  @Column({ type: 'varchar', nullable: true })
  lastName: string;

  @Column({ type: 'varchar', nullable: true })
  referralCode: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ type: 'varchar', nullable: true })
  tagId: string;

  @Column({ type: 'varchar', nullable: true })
  phoneNumber: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  countryCode: string;

  @Column({ type: 'varchar', nullable: true })
  residency: string;

  @Column({ type: 'varchar', nullable: true })
  region: string;

  @Column({ type: 'varchar', nullable: true })
  pendingEmail: string;

  @Column({ type: 'varchar', nullable: true })
  pendingPhoneNumber: string;

  @Column({ type: 'varchar', nullable: true })
  pin: string;

  @Column({ type: 'varchar', nullable: true })
  dateOfBirth: string;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin: Date;

  @Column({ type: 'varchar', nullable: true })
  profilePicture: string;

  //   @OneToMany(() => Wishlist, (wishlist) => wishlist.user, { cascade: true })
  //   wishlists: Wishlist[];

  @OneToMany(() => Token, (token) => token.user)
  tokens: Token[];

  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet[];

  @OneToMany(() => AuthSession, (session) => session.user)
  sessions: AuthSession[];

  @OneToMany(() => KycProfile, (kycProfile) => kycProfile.user)
  kycProfiles: KycProfile[];

  @OneToMany(() => FinancialTransaction, (transaction) => transaction.user)
  transactions: FinancialTransaction[];

  @OneToMany(() => ProviderOperation, (operation) => operation.user)
  providerOperations: ProviderOperation[];

  @OneToMany(() => Card, (card) => card.user)
  cards: Card[];

  @OneToMany(() => Beneficiary, (beneficiary) => beneficiary.user)
  beneficiaries: Beneficiary[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @OneToMany(
    () => NotificationPreference,
    (notificationPreference) => notificationPreference.user,
  )
  notificationPreferences: NotificationPreference[];

  @OneToMany(
    () => NotificationDevice,
    (notificationDevice) => notificationDevice.user,
  )
  notificationDevices: NotificationDevice[];

  @OneToMany(() => SupportTicket, (supportTicket) => supportTicket.user)
  supportTickets: SupportTicket[];

  @OneToMany(() => Dispute, (dispute) => dispute.user)
  disputes: Dispute[];

  @OneToMany(
    () => RewardLedgerEntry,
    (rewardLedgerEntry) => rewardLedgerEntry.user,
  )
  rewardLedgerEntries: RewardLedgerEntry[];

  @OneToMany(() => ReferralEvent, (referralEvent) => referralEvent.referrer)
  referralEvents: ReferralEvent[];

  @Column({ nullable: true })
  accountStatus: boolean;

  //   @Column({ type: 'enum', enum: Role, default: Role.REGULAR })
  //   role: Role;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  kycStatus: string;

  @Column({ type: 'simple-json', nullable: true })
  capabilities: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  productAvailability: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  limits: Record<string, unknown>;

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

  @Column({ type: 'varchar', nullable: true })
  resetToken?: string;

  @Column({ type: 'timestamp', nullable: true })
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
