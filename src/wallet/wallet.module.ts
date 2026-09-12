import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController, WalletsController } from './wallet.controller';
import { VidalpayModule } from 'src/vidalpay/vidalpay.module';

@Global()
@Module({
  imports: [VidalpayModule],
  controllers: [WalletController, WalletsController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
