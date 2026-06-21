import { Module } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { LoanProviderGateway } from './loan-provider.gateway';
import { LoanService } from './loan.service';

@Module({
  controllers: [LoanController],
  providers: [LoanService, LoanProviderGateway],
})
export class LoanModule {}
