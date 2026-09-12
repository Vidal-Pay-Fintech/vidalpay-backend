import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { VidalpayModule } from 'src/vidalpay/vidalpay.module';

@Module({
  imports: [VidalpayModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
