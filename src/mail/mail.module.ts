import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailService } from './email.service';
import { TokensService } from 'src/tokens/tokens.service';
import { PhoneService } from './phone.service';

@Global()
@Module({
  imports: [],
  providers: [MailService, EmailService, PhoneService, TokensService],
  exports: [MailService, EmailService, PhoneService, TokensService],
})
export class MailModule {}
