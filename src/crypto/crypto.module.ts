import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';

@Module({
  imports: [UserModule],
  controllers: [CryptoController],
  providers: [CryptoService],
})
export class CryptoModule {}
