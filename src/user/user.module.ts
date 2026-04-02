import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { IntegrationsModule } from 'src/integrations/integrations.module';
import { UserPolicyService } from './user-policy.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [UserController],
  providers: [UserService, UserPolicyService],
  exports: [UserService],
})
export class UserModule {}
