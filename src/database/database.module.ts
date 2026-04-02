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
