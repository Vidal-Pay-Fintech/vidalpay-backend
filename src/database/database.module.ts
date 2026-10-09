import { Global, Module, OnModuleInit } from '@nestjs/common';
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
import { AuthSession } from './entities/auth-session.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { Card } from './entities/card.entity';
import { Dispute } from './entities/dispute.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { FincraWebhookEvent } from './entities/fincra-webhook-event.entity';
import { KycProfile } from './entities/kyc-profile.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDevice } from './entities/notification-device.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { ProviderOperation } from './entities/provider-operation.entity';
import { ReferralEvent } from './entities/referral-event.entity';
import { RewardLedgerEntry } from './entities/reward-ledger-entry.entity';
import { SupportTicket } from './entities/support-ticket.entity';

//REPOSITORIES
import { UserRepository } from './repositories/user.repository';
import { TokenRepository } from './repositories/token.repository';
import { Token } from './entities/token.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { buildDatabaseDataSourceOptions } from './database.config';

@Global()
@Module({
  imports: [
    // SeedersModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...buildDatabaseDataSourceOptions(),
        autoLoadEntities: true,
        // The Render database already contains production data. Schema
        // changes must never be applied during application startup.
        synchronize: false,
        migrationsRun: false,
      }),

      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid DB options passed');
        }

        initializeTransactionalContext({
          storageDriver: StorageDriver.ASYNC_LOCAL_STORAGE,
        });

        // Render/Nest startup can load this module in a process where
        // typeorm-transactional already has a default DataSource registered.
        // The registry is in-memory only; clearing the stale entry prevents
        // startup from failing with `DataSource with name \"default\" has already added`
        // without touching the production database, schema, balances, or records.
        if (getDataSourceByName('default')) {
          deleteDataSourceByName('default');
        }

        return await addTransactionalDataSource({
          name: 'default',
          dataSource: new DataSource(options),
        });
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([
      User,
      Token,
      Wallet,
      AuthSession,
      Beneficiary,
      Card,
      Dispute,
      FinancialTransaction,
      FincraWebhookEvent,
      KycProfile,
      Notification,
      NotificationDevice,
      NotificationPreference,
      ProviderOperation,
      ReferralEvent,
      RewardLedgerEntry,
      SupportTicket,
    ]),
  ],
  providers: [UserRepository, ConfigService, TokenRepository, WalletRepository],
  exports: [TypeOrmModule, UserRepository, TokenRepository, WalletRepository],
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
