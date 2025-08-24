import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountStatus, User } from 'src/database/entities/user.entity';
import { HashingService } from '../hashing/hashing.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '../config/jwt.config';
import { ConfigType } from '@nestjs/config';
import { ActiveUserData } from '../interfaces/active-user-data-interfaces';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokensService } from 'src/tokens/tokens.service';
import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { TokenType } from 'src/common/enum/token-type.enum';
import { ResetPasswordLinkDto } from './dto/resetPasswordLinkDto.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserRepository } from 'src/database/repositories/user.repository';
import { API_MESSAGES } from 'src/utils/apiMessages';
import { UpdatePasswordDto } from 'src/user/dto/update-password.dto';
// import { Role } from 'src/common/enum/role.enum';
import { randomBytes } from 'crypto';
import { CONFIG_VARIABLES } from 'src/utils/config';
import { ILike, MoreThan } from 'typeorm';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { UTILITIES } from 'src/utils/helperFuncs';
import { PhoneService } from 'src/mail/phone.service';
import { Transactional } from 'typeorm-transactional';
// import { NotificationService } from 'src/notification/notification.service';
// import {
//   NOTIFICATION_MESSAGES,
//   NotificationType,
// } from 'src/notification/enum/notification.enum';
// import { ReferralRedeemRepository } from 'src/database/repositories/referralRedeem.repository';
// import { Promo } from 'src/database/entities/promo.entity';
// import { PromoRepository } from 'src/database/repositories/promo.repository';
import { WalletService } from 'src/wallet/wallet.service';
// import { PromoRedeemRepository } from 'src/database/repositories/promoRedeem.repository';
import { ResetTransactionPinDto } from './dto/reset-pin.dto';
import { PromoStatus } from 'src/common/enum/promo.enum';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { UserRole } from 'src/utils/enums/user.enum';
import { TagIdGenerator } from 'src/utils/tagIdGenerator';
import { VerifyPasswordResetOtpDto } from './dto/verify-password-resetotp.dto';
import { ResetPasswordAfterOtpDto } from './dto/reset-password-afterotp-verification.dto';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(User)
    private readonly usersService: UserService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly tokenService: TokensService,
    private readonly walletService: WalletService,
    private readonly mailService: MailService,
    private readonly userRepository: UserRepository,
    // private readonly walletRepository: WalletRepository,
    private readonly phoneService: PhoneService,
    // private readonly notificationService: NotificationService,
    // private readonly referralRedeemRepository: ReferralRedeemRepository,
    // private readonly promoRepository: PromoRepository,
    // private readonly walletService: WalletService,
    // private readonly promoRedeemRepository: PromoRedeemRepository,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  @Transactional()
  async signUp(signUpDto: SignUpDto) {
    const { firstName, lastName, password, phoneNumber, email } = signUpDto;

    await this.userRepository.checkUserExistByEmail(email);
    await this.userRepository.checkUserExistByPhone(phoneNumber);

    const hashedPassword = await this.hashingService.hash(password);
    const refCode = UTILITIES.generateReferralCode();
    const tagId = await TagIdGenerator.generateUniqueTagId(this.userRepository);

    const newUser = await this.userRepository.create({
      ...signUpDto,
      firstName,
      lastName,
      referralCode: refCode,
      password: hashedPassword,
      tagId,
      email,
      phoneNumber,
    });

    // CREATE THE CUSTOMER WALLET
    await this.walletService.createCustomerWallets(newUser.id);
    await this.sendEmailVerificationOtp(newUser);
    //SEBD OTP TO THE CUSTOMER PHONE NUMBER
    const phoneVerificationCode = this.generateSixDigitToken();
    // TODO: TO REPLACE LATER WITH THE SMS SERVICE
    // await this.phoneService.sendWelcomeSMS(
    //   phoneNumber,
    //   phoneVerificationCode,
    //   newUser.id,
    // );

    // await this.mailService.sendEmailVerificationCode(
    //   newUser.id,
    //   phoneVerificationCode,
    // );
    // CREATE THE REFERRAL RECORD IF THE REFERRAL CODE IS PRESENT

    // if (referralCode) {
    //   await this.processReferralOrPromoCode(referralCode, newUser.id);
    // }

    // await this.notificationService.sendNotificationToUser(
    //   newUser.id,
    //   NOTIFICATION_MESSAGES.ACCOUNT_REGISTRATION,
    //   NotificationType.SIGN_UP,
    // );

    // await this.notificationService.sendNotificationToAdmins(
    //   NOTIFICATION_MESSAGES.ADMIN_NEW_USER_SIGNUP,
    //   NotificationType.ADMIN,
    // );
    // delete newUser.password;
    const tokens = await this.generateToken(newUser);
    return { ...tokens, newUser };
  }

  async createTransactionPin(pin: string, userId: string) {
    const hashedPin = await this.hashingService.hash(pin);
    await this.userRepository.findOneAndUpdate(userId, {
      pin: hashedPin,
    });
    return API_MESSAGES.PIN_SET_SUCCESSFUL;
  }

  async verifyUserEmail(token: string): Promise<string> {
    const tokenEntity = await this.tokenService.findOneByToken(token);
    if (!tokenEntity || tokenEntity.expiration < new Date()) {
      throw new UnauthorizedException('Token is invalid or expired');
    }
    await this.userRepository.findOneAndUpdate(tokenEntity.user.id, {
      isVerified: true,
    });
    await this.tokenService.delete(tokenEntity.id);
    return API_MESSAGES.EMAIL_VERIFIED;
  }

  async verifyPhone(token: string): Promise<string> {
    const tokenEntity = await this.tokenService.findOneByToken(token);
    if (!tokenEntity || tokenEntity.expiration < new Date()) {
      throw new UnauthorizedException('Token is invalid or expired');
    }
    await this.userRepository.findOneAndUpdate(tokenEntity.user.id, {
      isPhoneVerified: true,
    });
    await this.tokenService.delete(tokenEntity.id);
    return API_MESSAGES.PHONE_VERIFIED_SUCCESSFULLY;
  }

  async resendVerificationEmail(email: string) {
    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    if (user.isVerified) {
      throw new BadRequestException(API_MESSAGES.USER_ALREADY_VERIFIED);
    }
    await this.sendEmailVerificationOtp(user);
    return API_MESSAGES.OTP_SENT;
  }

  async resendVerificationPhone(phone: string) {
    const user = await this.userRepository.findUserByEmailOrPhone(phone);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    if (user.isPhoneVerified) {
      throw new BadRequestException(API_MESSAGES.PHONE_ALREADY_VERIFIED);
    }

    const phoneVerificationCode = this.generateFourDigitToken();
    // await this.phoneService.sendWelcomeSMS(
    //   phone,
    //   phoneVerificationCode,
    //   user.id,
    // );
    return API_MESSAGES.OTP_SENT;
  }

  async signIn(signInDto: SignInDto) {
    const { email, phoneNumber, password } = signInDto;

    // Validate that at least one identifier is provided
    if (!email && !phoneNumber) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    // Use the identifier that was provided (email takes priority if both are provided)
    const identifier = email || phoneNumber;

    // TypeScript guard - this should never happen due to the validation above
    if (!identifier) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    const user = await this.userRepository.findUserByEmailOrPhone(identifier);

    if (!user) {
      throw new BadRequestException(API_MESSAGES.INVALID_LOGIN_CREDENTIALS);
    }

    const isEqual = await this.hashingService.compare(password, user.password);
    if (!isEqual) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PASSWORD);
    }

    if (user?.role !== UserRole.CUSTOMER) {
      throw new UnauthorizedException(API_MESSAGES.UNAUTHORIZED_ACCESS_ADMIN);
    }

    await this.validateUserValidity(user);
    const tokens = await this.generateToken(user);

    // Update the last login date
    await this.userRepository.findOneAndUpdate(user.id, {
      lastLogin: new Date(),
    });

    // Check the account status of the user
    await this.checkAccountStatus(user);

    // Remove password from response
    // delete user.password;

    return {
      ...tokens,
      user: user,
    };
  }

  async updatePassword(id: string, updatePasswordDto: UpdatePasswordDto) {
    const { password, newPassword } = updatePasswordDto;
    const user = await this.userRepository.findUserById(id);
    const isEqual = await this.hashingService.compare(password, user.password);
    if (!isEqual) {
      throw new BadRequestException(API_MESSAGES.INVALID_PASSWORD);
    }
    const hashedPassword = await this.hashingService.hash(newPassword);
    await this.userRepository.findOneAndUpdate(id, {
      password: hashedPassword,
    });
    return API_MESSAGES.PASSWORD_RESET_SUCCESSFUL;
  }

  async adminSignIn(signInDto: SignInDto) {
    const { email, phoneNumber, password } = signInDto;

    // Validate that at least one identifier is provided
    if (!email && !phoneNumber) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    // Use the identifier that was provided (email takes priority if both are provided)
    const identifier = email || phoneNumber;

    // TypeScript guard - this should never happen due to the validation above
    if (!identifier) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    const admin = await this.userRepository.findUserByEmail(identifier);
    if (!admin) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    if (admin.role == UserRole.ADMIN) {
      throw new UnauthorizedException(API_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const isEqual = await this.hashingService.compare(password, admin.password);

    if (!isEqual) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PASSWORD);
    }

    const tokens = await this.generateToken(admin);
    console.log(tokens);
    // delete admin.password;
    return {
      ...tokens,
      admin: admin,
    };
  }

  async sendResetPasswordLink(resetPasswordLinkDto: ResetPasswordLinkDto) {
    console.log(resetPasswordLinkDto);
    const { email } = resetPasswordLinkDto;
    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }
    const resetToken = randomBytes(32).toString('hex');
    await this.userRepository.findOneAndUpdate(user.id, {
      resetToken,
      resetTokenExpiry: new Date(Date.now() + 3600000), // Token expires in 1 hour
    });
    const passwordResetLink = `${CONFIG_VARIABLES.APP_URL}/change-password?token=${resetToken}&email=${resetPasswordLinkDto.email}`;
    // await this.mailService.sendResetEmailLink(user.id, passwordResetLink);
    return API_MESSAGES.RESET_PASSWORD_LINK_SENT;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, password } = resetPasswordDto;
    const user = await this.userRepository.findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: MoreThan(new Date()),
      },
    });
    if (!user) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_TOKEN);
    }
    const hashedPassword = await this.hashingService.hash(password);
    await this.userRepository.findOneAndUpdate(user.id, {
      password: hashedPassword,
      // resetToken: null,
      // resetTokenExpiry: null,
    });
    return API_MESSAGES.PASSWORD_CHANGED;
  }

  async generateToken(user: User) {
    const [accessToken, refreashToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        { email: user.email, role: user.role },
      ),
      this.signToken(user.id, this.jwtConfiguration.refreshAccessTokenTtl),
    ]);

    return { accessToken, refreashToken };
  }

  private async sendEmailVerificationOtp(user: User) {
    const verificationToken = this.generateSixDigitToken();
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 24);

    await this.tokenService.create({
      token: verificationToken,
      expiration: tokenExpiration,
      type: TokenType.VERIFICATION,
      user,
    });

    return await this.mailService.sendEmailVerificationCode(
      user.id,
      verificationToken,
    );
  }

  private async signToken<T>(userId: string, expiresIn: number, payload?: T) {
    return await this.jwtService.signAsync(
      {
        sub: userId,
        ...payload,
      },
      {
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
        secret: this.jwtConfiguration.secret,
        expiresIn: this.jwtConfiguration.accessTokenTtl,
      },
    );
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const { sub } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'>
      >(refreshTokenDto.refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
      const user = await this.userRepository.findOne({
        where: { id: sub },
      });
      return this.generateToken(user as User);
    } catch (error) {
      throw new UnauthorizedException();
    }
  }

  public generateFourDigitToken(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  //generate a 6 digit token
  public generateSixDigitToken(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  public async validateTransactionPin(userId: string, pin: string) {
    const user = await this.userRepository.findUserById(userId);

    const isPinValid = await this.hashingService.compare(pin, user.pin);

    if (!isPinValid) {
      throw new PreconditionFailedException(`Invalid transaction pin`);
    }

    return true;
  }

  private async validateUserValidity(user: User) {
    if (!user.isVerified) {
      await this.sendEmailVerificationOtp(user);
      throw new UnauthorizedException(API_MESSAGES.EMAIL_NOT_VERIFIED);
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException(API_MESSAGES.ACCOUNT_SUSPENDED);
    }

    // TODO: BRING THIS BACK LATER
    // if (!user.isPhoneVerified) {
    //   await this.resendVerificationPhone(user.phoneNumber);
    //   throw new UnauthorizedException(API_MESSAGES.PHONE_NOT_VERIFIED);
    // }
    return user;
  }

  // async checkIsReferralOrPromoCodeValid(
  //   referralCode: string,
  //   promousedBy?: PromoUsedBy,
  // ) {
  //   let userReferalExists: User = null;
  //   let promoCode: Promo = null;

  //   userReferalExists = await this.userRepository.findOne({
  //     where: {
  //       referralCode: ILike(referralCode),
  //     },
  //   });

  //   promoCode = await this.promoRepository.findOne({
  //     where: {
  //       code: ILike(referralCode),
  //     },
  //   });

  //   if (!userReferalExists && !promoCode) {
  //     throw new BadRequestException(API_MESSAGES.INVALID_REFERRAL_CODE);
  //   }

  //   if (
  //     (promoCode && promoCode?.status === PromoStatus.DEACTIVATED) ||
  //     promoCode?.status === PromoStatus.EXPIRED
  //   ) {
  //     throw new BadRequestException(API_MESSAGES.PROMO_CODE_EXPIRED);
  //   }
  //   if (promoCode) {
  //     if (
  //       promoCode?.usedBy !== promousedBy &&
  //       promoCode?.usedBy !== PromoUsedBy.ALL_USERS
  //     ) {
  //       throw new BadRequestException(
  //         API_MESSAGES.PROMO_CODE_NOT_FOR_YOUR_TYPE,
  //       );
  //     }
  //   }
  //   return true;
  // }

  /**
   *
   * @param referralCode
   * @param newUserId
   * @returns PROCES PLAYER REFERRAL CODE
   */
  // async processReferralOrPromoCode(referralCode: string, newUserId: string) {
  //   let userReferalExists: User = null;
  //   let promoCode: Promo = null;
  //   userReferalExists = await this.userRepository.findOne({
  //     where: {
  //       referralCode,
  //     },
  //   });

  //   promoCode = await this.promoRepository.findOne({
  //     where: {
  //       code: referralCode,
  //     },
  //   });

  //   if (userReferalExists) {
  //     await this.referralRedeemRepository.create({
  //       referredByUserId: userReferalExists.id,
  //       referredPlayerId: newUserId,
  //       referralCode,
  //     });
  //   }

  //   if (promoCode) {
  //     await this.promoRepository.validatePromoCode(promoCode.code);
  //     await this.promoRedeemRepository.create({
  //       code: promoCode.code,
  //       userId: newUserId,
  //       redeemDate: new Date(),
  //       amount: Number(promoCode.amount),
  //     });
  //     await this.walletService.creditGameBalanceWallet(
  //       newUserId,
  //       Number(promoCode?.amount),
  //     );
  //     await this.promoRepository.findOneAndUpdate(promoCode.id, {
  //       appliedTimes: Number(promoCode.appliedTimes) + 1,
  //     });
  //   }

  //   return true;
  // }

  public async requestTransactionPinReset(userId: string) {
    const user = await this.userRepository.findUserById(userId);

    const verificationToken = this.generateSixDigitToken();
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 1);

    await this.tokenService.create({
      token: verificationToken,
      expiration: tokenExpiration,
      type: TokenType.TRANSACTION_PIN_RESET,
      user,
    });

    await this.mailService.sendResetTransactionPinCode(
      user.id,
      verificationToken,
    );
    return API_MESSAGES.OTP_SENT;
  }

  public async resetTransactionPin(
    resetPinDto: ResetTransactionPinDto,
    userId: string,
  ) {
    const { pin } = resetPinDto;
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.findOneAndUpdate(user.id, {
      pin: await this.hashingService.hash(pin),
    });
    return API_MESSAGES.PIN_RESET_SUCCESSFUL;
  }

  // STEP 1: User enters email - Request password reset (sends OTP to email)
  public async requestPasswordReset(email: string) {
    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    // Generate 6-digit OTP
    const verificationToken = this.generateSixDigitToken();
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 1); // 1 hour expiry

    // Save OTP token for password reset
    await this.tokenService.create({
      token: verificationToken,
      expiration: tokenExpiration,
      type: TokenType.PASSWORD_RESET,
      user,
    });

    // Send OTP via email
    await this.mailService.sendResetPasswordOTP(user.id, verificationToken);

    return API_MESSAGES.OTP_SENT;
  }

  // STEP 2: User enters OTP code - Verify OTP without resetting password
  public async verifyPasswordResetOtp(verifyOtpDto: VerifyPasswordResetOtpDto) {
    const { email, otp } = verifyOtpDto;

    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    const validToken = await this.tokenService.findOneByTokenAndValidate(
      otp,
      TokenType.PASSWORD_RESET,
      user.id,
    );

    if (!validToken) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PIN);
    }

    return {
      message: API_MESSAGES.OTP_VERIFIED,
      userId: user.id,
      verificationId: validToken.id,
    };
  }

  // STEP 3: User enters new password - Reset password after OTP verification
  public async resetPasswordWithVerifiedOtp(
    resetPasswordDto: ResetPasswordAfterOtpDto,
  ) {
    const { email, otp, newPassword } = resetPasswordDto;

    // Find user by email
    const user = await this.userRepository.findUserByEmail(email);
    if (!user) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    // Use the correct method signature: 3 separate parameters
    const validToken = await this.tokenService.findOneByTokenAndValidate(
      otp,
      TokenType.PASSWORD_RESET,
      user.id,
    );

    if (!validToken) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PIN);
    }

    // Hash new password and update user
    const hashedPassword = await this.hashingService.hash(newPassword);
    await this.userRepository.findOneAndUpdate(user.id, {
      password: hashedPassword,
    });

    // Delete/invalidate the used OTP token
    await this.tokenService.delete(validToken.id);

    return API_MESSAGES.PASSWORD_RESET_SUCCESSFUL;
  }

  public async verifyToken(token: string) {
    const verifiedUser = await this.jwtService.verifyAsync(token, {
      secret: this.jwtConfiguration.secret,
    });
    return verifiedUser;
  }

  public async validateToken(token: string) {
    const tokenEntity = await this.tokenService.findOneByToken(token);
    if (!tokenEntity || tokenEntity.expiration < new Date()) {
      throw new UnprocessableEntityException(API_MESSAGES.INVALID_TOKEN);
    }
    await this.tokenService.delete(tokenEntity.id);
    return API_MESSAGES.OTP_VERIFIED;
  }

  public async deactivateAccount(
    deactivateAccountDto: DeactivateAccountDto,
    userId: string,
  ) {
    const { password, reason } = deactivateAccountDto;
    const user = await this.userRepository.findUserById(userId);
    const isEqual = await this.hashingService.compare(password, user.password);
    if (!isEqual) {
      throw new UnprocessableEntityException(API_MESSAGES.INVALID_PASSWORD);
    }

    await this.userRepository.findOneAndUpdate(userId, {
      status: AccountStatus.DEACTIVATED,
      reasonForDeactivation: reason,
    });
    //TODO: SEND EMAIL TO THE USER THAT THE ACCOUNT HAS BEEN DEACTIVATED
    // await this.mailService.sendAccountDeactivatedNotification(userId);
    return API_MESSAGES.ACCOUNT_DEACTIVATED;
  }

  public async checkAccountStatus(user: User) {
    if (user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException(API_MESSAGES.ACCOUNT_SUSPENDED);
    }

    if (user.status === AccountStatus.DEACTIVATED) {
      //CHECK THE LAST LOGIN OF THE USER IF IT'S WITHING THE LAST 30 DAYS. IF NOT WITHING THE LAST 30 DAYS, SUSPEND THE ACCOUNT AND ASK THE USER TO CONTACT SUPPORT
      const lastLogin = user.lastLogin;
      const currentDate = new Date();
      const diffInDays = Math.abs(
        (currentDate.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffInDays > 30) {
        await this.userRepository.findOneAndUpdate(user.id, {
          status: AccountStatus.SUSPENDED,
        });
        throw new UnauthorizedException(API_MESSAGES.ACCOUNT_SUSPENDED);
      }
    }

    return user;
  }
}
