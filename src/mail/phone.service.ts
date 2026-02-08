import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Twilio } from 'twilio';
import { TokensService } from 'src/tokens/tokens.service';
import { UserRepository } from 'src/database/repositories/user.repository';
import { User } from 'src/database/entities/user.entity';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { TokenType } from 'src/common/enum/token-type.enum';
import { CONFIG_VARIABLES } from 'src/utils/config';

@Injectable()
export class PhoneService {
  private readonly SENDER_ID = 'Lottonownow';
  private user: User;
  private readonly logger = new Logger(PhoneService.name);
  private twilioClient: Twilio;

  constructor(
    private readonly tokensService: TokensService,
    private readonly userRepository: UserRepository,
  ) {
    // Initialize Twilio client
    this.twilioClient = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  private async getUserDetails(userId: string) {
    this.user = await this.userRepository.findUserById(userId);
  }

  private detectCountryAndFormatPhone(phone: string): string {
    // Remove spaces, dashes, parentheses
    let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

    // If already in E.164 format, return as is
    if (cleanPhone.startsWith('+')) {
      return cleanPhone;
    }

    // Detect and format based on country patterns
    if (this.isNigerianNumber(cleanPhone)) {
      return this.formatNigerianPhoneNumber(cleanPhone);
    } else if (this.isUSNumber(cleanPhone)) {
      return this.formatUSPhoneNumber(cleanPhone);
    } else {
      // Default fallback - log warning and try as US number
      this.logger.warn(
        `Unknown phone number format: ${phone}. Treating as US number.`,
      );
      return this.formatUSPhoneNumber(cleanPhone);
    }
  }

  private isNigerianNumber(phone: string): boolean {
    // Nigerian numbers: 234xxxxxxxxxx, 0xxxxxxxxxx, or xxxxxxxxxx (11 digits starting with 07, 08, 09)
    const cleanPhone = phone.replace(/^(\+234|234|0)/, '');
    return (
      /^[789]\d{9}$/.test(cleanPhone) ||
      phone.startsWith('234') ||
      phone.startsWith('0')
    );
  }

  private isUSNumber(phone: string): boolean {
    // US numbers: 1xxxxxxxxxx, xxxxxxxxxx (10 digits), or +1xxxxxxxxxx
    const cleanPhone = phone.replace(/^(\+1|1)/, '');
    return (
      /^\d{10}$/.test(cleanPhone) ||
      phone.startsWith('1') ||
      phone.startsWith('+1')
    );
  }

  private formatNigerianPhoneNumber(phone: string): string {
    // Remove any existing country codes or leading zero
    let cleanPhone = phone.replace(/^(\+234|234|0)/, '');

    // Validate Nigerian mobile number format (must start with 7, 8, or 9)
    if (!/^[789]\d{9}$/.test(cleanPhone)) {
      throw new Error(`Invalid Nigerian phone number format: ${phone}`);
    }

    return `+234${cleanPhone}`;
  }

  private formatUSPhoneNumber(phone: string): string {
    // Remove any existing country codes
    let cleanPhone = phone.replace(/^(\+1|1)/, '');

    // Validate US phone number format (10 digits)
    if (!/^\d{10}$/.test(cleanPhone)) {
      throw new Error(`Invalid US phone number format: ${phone}`);
    }

    return `+1${cleanPhone}`;
  }

  private async sendSMSTwilio(phone: string, message: string) {
    try {
      // Auto-detect country and format phone number
      const formattedPhone = this.detectCountryAndFormatPhone(phone);

      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER, // Your US Twilio phone number
        to: formattedPhone,
      });

      this.logger.log(
        `SMS sent successfully to ${formattedPhone}. SID: ${result.sid}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}: ${error.message}`);
      throw error;
    }
  }

  public async sendWelcomeSMS(
    phone: string,
    code: string,
    user_id: string,
    platform?: string, // This parameter is kept for backward compatibility but not used with Twilio
  ) {
    try {
      this.logger.log(`Sending SMS to ${phone}`);
      await this.getUserDetails(user_id);

      // Create token for phone verification
      await this.tokensService.create({
        token: code,
        user: this.user,
        type: TokenType.PHONE_VERIFICATION,
        expiration: new Date(Date.now() + 600000), // 10 minutes
      });

      // Detect country for potential message customization
      const formattedPhone = this.detectCountryAndFormatPhone(phone);
      const isNigerian = formattedPhone.startsWith('+234');

      // You can customize messages based on country if needed
      const message = `Welcome to ${CONFIG_VARIABLES.APP_NAME}, Your phone verification pin is: ${code}`;

      // Send SMS with Twilio
      const messageRes = await this.sendSMSTwilio(phone, message);

      console.log(messageRes, 'THE MESSAGE RES');

      if (messageRes?.sid) {
        return `Message sent successfully to ${formattedPhone}`;
      } else {
        throw new ServiceUnavailableException(
          API_MESSAGES.COULD_NOT_VERIFY_PHONE,
        );
      }
    } catch (err) {
      this.logger.error(`Error sending welcome SMS: ${err.message}`);
      throw new ServiceUnavailableException(
        API_MESSAGES.COULD_NOT_VERIFY_PHONE,
      );
    }
  }
}
