import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { DatabaseModule } from './database/database.module';
import { IamModule } from './iam/iam.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './database/entities/user.entity';
import { Token } from './database/entities/token.entity';
import { VaultModule } from './vault/vault.module';
import { TransactionModule } from './transaction/transaction.module';
import { JournalModule } from './journal/journal.module';

@Module({
  imports: [
    UserModule,
    WalletModule,
    DatabaseModule,
    IamModule,
    MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    VaultModule,
    TransactionModule,
    JournalModule,
  ],
  controllers: [AppController],
  providers: [AppService, ConfigService],
})
export class AppModule {}
