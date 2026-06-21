import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxProviderGateway } from './tax-provider.gateway';
import { TaxService } from './tax.service';

@Module({
  controllers: [TaxController],
  providers: [TaxService, TaxProviderGateway],
})
export class TaxModule {}
