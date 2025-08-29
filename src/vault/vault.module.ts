import { Global, Module } from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';

@Global()
@Module({
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
