import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailService } from './email.service';
import { TokensService } from 'src/tokens/tokens.service';
import { PhoneService } from './phone.service';
// MailService, EmailService to be added to provider and export later
console.log(process.env.SMTP_HOST, 'THE SMTP HOST');
@Global()
@Module({
  imports: [],
  providers: [MailService, EmailService, PhoneService, TokensService],
  exports: [MailService, EmailService, PhoneService, TokensService],
})
export class MailModule {}
