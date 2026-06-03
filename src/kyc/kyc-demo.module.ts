import { Module } from '@nestjs/common';
import { IntegrationsModule } from 'src/integrations/integrations.module';
import { KycDemoController } from './kyc-demo.controller';
import { KycDemoService } from './kyc-demo.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [KycDemoController],
  providers: [KycDemoService],
})
export class KycDemoModule {}
