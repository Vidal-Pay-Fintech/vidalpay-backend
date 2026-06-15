import { Global, Module } from '@nestjs/common';
import { BeneficiaryService } from './beneficiary.service';
import { BeneficiaryController } from './beneficiary.controller';
import { UserModule } from 'src/user/user.module';

@Global()
@Module({
  imports: [UserModule],
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService],
  exports: [BeneficiaryService],
})
export class BeneficiaryModule {}
