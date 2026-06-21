import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { DatabaseModule } from './database/database.module';
import { IamModule } from './iam/iam.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VaultModule } from './vault/vault.module';
import { TransactionModule } from './transaction/transaction.module';
import { JournalModule } from './journal/journal.module';
import { BeneficiaryModule } from './beneficiary/beneficiary.module';
import { SupportModule } from './support/support.module';
import { LegalModule } from './legal/legal.module';
import { CryptoModule } from './crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { validateEnvironment } from './config/env.validation';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { ProvidersModule } from './providers/providers.module';
import { VersionModule } from './version/version.module';
import { NotificationModule } from './notifications/notification.module';
import { RewardsModule } from './rewards/rewards.module';
import { FxModule } from './fx/fx.module';
import { TransfersModule } from './transfers/transfers.module';
import { CardsModule } from './cards/cards.module';
import { KycDemoModule } from './kyc/kyc-demo.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AdminModule } from './admin/admin.module';
import { InvestmentModule } from './investments/investment.module';
import { TaxModule } from './tax/tax.module';
import { LoanModule } from './loans/loan.module';
import { DisputeModule } from './disputes/dispute.module';
import { ScheduledPaymentModule } from './scheduled-payments/scheduled-payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnvironment,
    }),
    FeatureFlagsModule,
    ProvidersModule,
    DatabaseModule,
    IamModule,
    MailModule,
    UserModule,
    NotificationModule,
    VaultModule,
    TransactionModule,
    JournalModule,
    WalletModule,
    BeneficiaryModule,
    SupportModule,
    LegalModule,
    CryptoModule,
    HealthModule,
    VersionModule,
    RewardsModule,
    FxModule,
    TransfersModule,
    CardsModule,
    KycDemoModule,
    WebhooksModule,
    AdminModule,
    InvestmentModule,
    TaxModule,
    LoanModule,
    DisputeModule,
    ScheduledPaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService],
})
export class AppModule {}
