import { Module } from '@nestjs/common';
import { InvestmentController } from './investment.controller';
import { InvestmentProviderGateway } from './investment-provider.gateway';
import { InvestmentService } from './investment.service';

@Module({
  controllers: [InvestmentController],
  providers: [InvestmentService, InvestmentProviderGateway],
})
export class InvestmentModule {}
