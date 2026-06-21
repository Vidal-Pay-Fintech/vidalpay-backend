import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { CryptoProviderGateway } from './crypto-provider.gateway';

@Module({
  imports: [UserModule],
  controllers: [CryptoController],
  providers: [CryptoService, CryptoProviderGateway],
})
export class CryptoModule {}
