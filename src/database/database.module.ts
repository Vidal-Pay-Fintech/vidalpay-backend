import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  getDataSourceByName,
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
// import { SeederService, SeedersModule } from './seeders';

//ENTITIES
import { User } from './entities/user.entity';
import { Wallet } from './entities/wallet.entity';
import { Vault } from './entities/vault.entity';
import { VaultJournal } from './entities/vault-journal.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { UserKyc } from './entities/user-kyc.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { ProviderOperation } from './entities/provider-operation.entity';
import { ProviderWebhookEvent } from './entities/provider-webhook-event.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { Card } from './entities/card.entity';
import { CardFunding } from './entities/card-funding.entity';
import { CardSettings } from './entities/card-settings.entity';
import { CardTransaction } from './entities/card-transaction.entity';
import { DeviceToken } from './entities/device-token.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { ProviderConfiguration } from './entities/provider-configuration.entity';
import { ProviderStatus } from './entities/provider-status.entity';
import { RewardAccount } from './entities/reward-account.entity';
import { RewardBalance } from './entities/reward-balance.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';

//REPOSITORIES
import { UserRepository } from './repositories/user.repository';
import { TokenRepository } from './repositories/token.repository';
import { Token } from './entities/token.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { VaultRepository } from './repositories/vault.repository';
import { VaultJournalRepository } from './repositories/vault-journal.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { BeneficiaryRepository } from './repositories/beneficiary.repository';
import { UserKycRepository } from './repositories/user-kyc.repository';
import { KycDocumentRepository } from './repositories/kyc-document.repository';
import { ProviderOperationRepository } from './repositories/provider-operation.repository';
import { ProviderWebhookEventRepository } from './repositories/provider-webhook-event.repository';
import { SupportTicketRepository } from './repositories/support-ticket.repository';
import { CardFundingRepository } from './repositories/card-funding.repository';
import { CardRepository } from './repositories/card.repository';
import { CardSettingsRepository } from './repositories/card-settings.repository';
import { CardTransactionRepository } from './repositories/card-transaction.repository';
import { NotificationRepository } from './repositories/notification.repository';
import { RewardAccountRepository } from './repositories/reward-account.repository';
import { RewardBalanceRepository } from './repositories/reward-balance.repository';
import { RewardTransactionRepository } from './repositories/reward-transaction.repository';

interface DatabaseConfig {
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_DATABASE: string;
  MYSQL_USERNAME: string;
  MYSQL_PASSWORD: string;
}

let transactionalContextInitialized = false;

@Global()
@Module({
  imports: [
    // SeedersModule,
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService<DatabaseConfig>) => ({
        type: 'mysql',
        host: configService.getOrThrow('MYSQL_HOST'),
        port: configService.getOrThrow('MYSQL_PORT'),
        database: configService.getOrThrow('MYSQL_DATABASE'),
        username: configService.getOrThrow('MYSQL_USERNAME'),
        password: configService.getOrThrow('MYSQL_PASSWORD'),
        autoLoadEntities: true,
        synchronize: false,
      }),

      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid DB options passed');
        }

        if (!transactionalContextInitialized) {
          initializeTransactionalContext({
            storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE,
          });
          transactionalContextInitialized = true;
        }

        const dataSourceName = options.name ?? 'default';
        const existingDataSource = getDataSourceByName(dataSourceName);
        if (existingDataSource) {
          if (existingDataSource.isInitialized) {
            return existingDataSource;
          }

          deleteDataSourceByName(dataSourceName);
        }

        return addTransactionalDataSource({
          name: dataSourceName,
          dataSource: new DataSource(options),
        });
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([
      User,
      Token,
      Wallet,
      Vault,
      VaultJournal,
      TransactionEntity,
      Beneficiary,
      UserKyc,
      KycDocument,
      ProviderOperation,
      ProviderWebhookEvent,
      SupportTicket,
      Card,
      CardFunding,
      CardSettings,
      CardTransaction,
      DeviceToken,
      FeatureFlag,
      Notification,
      NotificationPreference,
      ProviderConfiguration,
      ProviderStatus,
      RewardAccount,
      RewardBalance,
      RewardTransaction,
    ]),
  ],
  providers: [
    UserRepository,
    ConfigService,
    TokenRepository,
    WalletRepository,
    VaultRepository,
    VaultJournalRepository,
    TransactionRepository,
    BeneficiaryRepository,
    UserKycRepository,
    KycDocumentRepository,
    ProviderOperationRepository,
    ProviderWebhookEventRepository,
    SupportTicketRepository,
    CardRepository,
    CardFundingRepository,
    CardSettingsRepository,
    CardTransactionRepository,
    NotificationRepository,
    RewardAccountRepository,
    RewardBalanceRepository,
    RewardTransactionRepository,
  ],
  exports: [
    TypeOrmModule,
    UserRepository,
    TokenRepository,
    WalletRepository,
    VaultRepository,
    VaultJournalRepository,
    TransactionRepository,
    BeneficiaryRepository,
    UserKycRepository,
    KycDocumentRepository,
    ProviderOperationRepository,
    ProviderWebhookEventRepository,
    SupportTicketRepository,
    CardRepository,
    CardFundingRepository,
    CardSettingsRepository,
    CardTransactionRepository,
    NotificationRepository,
    RewardAccountRepository,
    RewardBalanceRepository,
    RewardTransactionRepository,
  ],
})
export class DatabaseModule {}

// export class DatabaseModule implements OnModuleInit {
//   constructor(private readonly seederService: SeederService) {}

//   async onModuleInit() {
//     // Only run seeders in development or when explicitly enabled
//     const shouldRunSeeders =
//       process.env.RUN_SEEDERS === 'true' ||
//       process.env.NODE_ENV === 'development';

//     if (shouldRunSeeders) {
//       await this.seederService.runAllSeeders();
//     }
//   }
// }
