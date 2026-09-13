import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  addTransactionalDataSource,
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
        return await addTransactionalDataSource(new DataSource(options));
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
