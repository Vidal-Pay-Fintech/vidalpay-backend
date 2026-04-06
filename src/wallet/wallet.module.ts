import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { UserModule } from 'src/user/user.module';
import { IntegrationsModule } from 'src/integrations/integrations.module';

@Global()
@Module({
  imports: [UserModule, IntegrationsModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
