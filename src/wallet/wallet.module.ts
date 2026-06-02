import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { UserModule } from 'src/user/user.module';
import { IntegrationsModule } from 'src/integrations/integrations.module';
import { WalletsController } from './wallets.controller';
import { CardsModule } from 'src/cards/cards.module';

@Global()
@Module({
  imports: [UserModule, IntegrationsModule, CardsModule],
  controllers: [WalletController, WalletsController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
