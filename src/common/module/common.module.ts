import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AWSDBCredentialsService } from '../service/AWSSecretsService.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [],
  providers: [AWSDBCredentialsService],
  exports: [AWSDBCredentialsService],
})
export class CommonModule {}
