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
import { Vault } from './entities/vault.entity';
import { VaultJournal } from './entities/vault-journal.entity';
import { TransactionEntity } from './entities/transaction.entity';

//REPOSITORIES
import { UserRepository } from './repositories/user.repository';
import { TokenRepository } from './repositories/token.repository';
import { Token } from './entities/token.entity';
import { WalletRepository } from './repositories/wallet.repository';
import { VaultRepository } from './repositories/vault.repository';
import { VaultJournalRepository } from './repositories/vault-journal.repository';
import { TransactionRepository } from './repositories/transaction.repository';

interface DatabaseConfig {
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_DATABASE: string;
  MYSQL_USERNAME: string;
  MYSQL_PASSWORD: string;
}

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
        synchronize: true,
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
      Vault,
      VaultJournal,
      TransactionEntity,
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
  ],
  exports: [
    TypeOrmModule,
    UserRepository,
    TokenRepository,
    WalletRepository,
    VaultRepository,
    VaultJournalRepository,
    TransactionRepository,
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
