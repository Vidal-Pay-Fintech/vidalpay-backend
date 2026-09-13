import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Beneficiary } from 'src/database/entities/beneficiary.entity';
import { Card } from 'src/database/entities/card.entity';
import { Dispute } from 'src/database/entities/dispute.entity';
import { FinancialTransaction } from 'src/database/entities/financial-transaction.entity';
import { KycProfile } from 'src/database/entities/kyc-profile.entity';
import { Notification } from 'src/database/entities/notification.entity';
import { NotificationDevice } from 'src/database/entities/notification-device.entity';
import { NotificationPreference } from 'src/database/entities/notification-preference.entity';
import { ProviderOperation } from 'src/database/entities/provider-operation.entity';
import { ReferralEvent } from 'src/database/entities/referral-event.entity';
import { RewardLedgerEntry } from 'src/database/entities/reward-ledger-entry.entity';
import { SupportTicket } from 'src/database/entities/support-ticket.entity';
import { Token } from 'src/database/entities/token.entity';
import { User } from 'src/database/entities/user.entity';
import { Wallet } from 'src/database/entities/wallet.entity';
import {
  BeneficiaryController,
  CardsController,
  CryptoController,
  DisputesController,
  FxController,
  InvestmentsController,
  KycController,
  LegalController,
  LoansController,
  MoneyRequestsController,
  NotificationsController,
  ProvidersController,
  QrController,
  ReferralsController,
  RewardsController,
  SupportController,
  TaxController,
  TransactionController,
  TransfersController,
  WebhooksController,
} from './vidalpay.controller';
import { ProviderHttpService } from './provider-http.service';
import { ProviderStatusService } from './provider-status.service';
import { VidalpayService } from './vidalpay.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Beneficiary,
      Card,
      Dispute,
      FinancialTransaction,
      KycProfile,
      Notification,
      NotificationDevice,
      NotificationPreference,
      ProviderOperation,
      ReferralEvent,
      RewardLedgerEntry,
      SupportTicket,
      Token,
      User,
      Wallet,
    ]),
  ],
  controllers: [
    BeneficiaryController,
    CardsController,
    CryptoController,
    DisputesController,
    FxController,
    InvestmentsController,
    KycController,
    LegalController,
    LoansController,
    MoneyRequestsController,
    NotificationsController,
    ProvidersController,
    QrController,
    ReferralsController,
    RewardsController,
    SupportController,
    TaxController,
    TransactionController,
    TransfersController,
    WebhooksController,
  ],
  providers: [
    ConfigService,
    ProviderHttpService,
    ProviderStatusService,
    VidalpayService,
  ],
  exports: [ProviderStatusService, VidalpayService],
})
export class VidalpayModule {}
