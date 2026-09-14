import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
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
import { randomUUID } from 'crypto';
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
import { ReauthDto } from './dto/reauth.dto';
import { Request } from 'express';
import { AuthSession } from 'src/database/entities/auth-session.entity';
import { Repository, IsNull } from 'typeorm';

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
    @InjectRepository(AuthSession)
    private readonly authSessionRepository: Repository<AuthSession>,
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
  async signUp(signUpDto: SignUpDto, request?: Request) {
    const { firstName, lastName, password, phoneNumber, email } = signUpDto;
    const normalizedPhoneNumber = this.normalizePhoneNumberForRegion(
      phoneNumber,
      signUpDto.countryCode,
      signUpDto.country,
    );

    await this.userRepository.checkUserExistByEmail(email);
    // await this.userRepository.checkUserExistByPhone(phoneNumber);

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
      phoneNumber: normalizedPhoneNumber,
      countryCode: signUpDto.countryCode,
      country: signUpDto.country,
      residency: signUpDto.residency,
      region: this.inferRegion(
        signUpDto.countryCode,
        signUpDto.country,
        normalizedPhoneNumber,
      ),
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
    const tokens = await this.generateToken(newUser, request);
    return {
      ...tokens,
      user: this.sanitizeUser(newUser),
      newUser: this.sanitizeUser(newUser),
    };
  }

  async createTransactionPin(pin: string, userId: string) {
    const hashedPin = await this.hashingService.hash(pin);
    await this.userRepository.findOneAndUpdate(userId, {
      pin: hashedPin,
    });
    return API_MESSAGES.PIN_SET_SUCCESSFUL;
  }

  async verifyUserEmail(token: string, request?: Request) {
    const tokenEntity = await this.tokenService.findOneByTokenAndType(
      token,
      TokenType.VERIFICATION,
    );
    if (!tokenEntity) {
      throw new UnauthorizedException('Token is invalid or expired');
    }
    const user = await this.userRepository.findOneAndUpdate(
      tokenEntity.user.id,
      {
        isVerified: true,
      },
    );
    await this.tokenService.delete(tokenEntity.id);
    const tokens = await this.generateToken(user, request);
    return {
      message: API_MESSAGES.EMAIL_VERIFIED,
      ...tokens,
      user: this.sanitizeUser(user),
    };
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
    const user = await this.findUserByEmailOrPhoneVariants(phone);
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

  async signIn(signInDto: SignInDto, request?: Request) {
    const { email, phoneNumber, password } = signInDto;
    const user = email
      ? await this.userRepository.findUserByEmail(email)
      : phoneNumber
        ? await this.findUserByPhoneVariants(phoneNumber)
        : null;
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
    await this.checkAccountStatus(user);
    const tokens = await this.generateToken(user, request);
    // await this.notificationService.sendNotificationToUser(
    //   user.id,
    //   NOTIFICATION_MESSAGES.ACCOUNT_LOGIN,
    //   NotificationType.SIGN_UP,
    // );
    // UPDATE THE LAST LOGIN DATE
    await this.userRepository.findOneAndUpdate(user.id, {
      lastLogin: new Date(),
    });
    // delete user.password;
    return {
      ...tokens,
      user: this.sanitizeUser(user),
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

  async adminSignIn(signInDto: SignInDto, request?: Request) {
    const { email, password } = signInDto;
    const admin = await this.userRepository.findUserByEmail(email);
    if (!admin) {
      throw new BadRequestException(API_MESSAGES.USER_NOT_FOUND);
    }

    if (admin.role !== UserRole.ADMIN) {
      throw new UnauthorizedException(API_MESSAGES.UNAUTHORIZED_ACCESS);
    }

    const isEqual = await this.hashingService.compare(password, admin.password);

    if (!isEqual) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PASSWORD);
    }

    const tokens = await this.generateToken(admin, request);
    // delete admin.password;
    return {
      ...tokens,
      admin: this.sanitizeUser(admin),
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

  async generateToken(
    user: User,
    request?: Request,
    existingSession?: AuthSession,
  ) {
    let session: AuthSession;

    try {
      session =
        existingSession ?? (await this.createAuthSession(user, request));
    } catch (error) {
      if (this.isMissingAuthSessionStore(error)) {
        return this.generateStatelessTokens(user);
      }
      throw error;
    }

    const [accessToken, refreashToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        {
          email: user.email,
          role: user.role,
          sessionId: session.id,
          familyId: session.familyId,
        },
      ),
      this.signToken(user.id, this.jwtConfiguration.refreshAccessTokenTtl, {
        tokenType: 'refresh',
        sessionId: session.id,
        familyId: session.familyId,
      }),
    ]);

    session.refreshTokenHash = await this.hashingService.hash(refreashToken);
    session.expiresAt = new Date(
      Date.now() + this.jwtConfiguration.refreshAccessTokenTtl * 1000,
    );
    session.lastUsedAt = new Date();
    try {
      await this.authSessionRepository.save(session);
    } catch (error) {
      if (this.isMissingAuthSessionStore(error)) {
        return this.generateStatelessTokens(user);
      }
      throw error;
    }

    return { accessToken, refreshToken: refreashToken, refreashToken };
  }

  private async generateStatelessTokens(user: User) {
    const [accessToken, refreashToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        {
          email: user.email,
          role: user.role,
        },
      ),
      this.signToken(user.id, this.jwtConfiguration.refreshAccessTokenTtl, {
        tokenType: 'refresh',
        sessionMode: 'stateless',
      }),
    ]);

    return {
      accessToken,
      refreshToken: refreashToken,
      refreashToken,
      sessionMode: 'stateless',
    };
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
        expiresIn,
      },
    );
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    let payload: Pick<ActiveUserData, 'sub' | 'sessionId' | 'familyId'> & {
      tokenType?: string;
      sessionMode?: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(
        refreshTokenDto.refreshToken,
        {
          secret: this.jwtConfiguration.secret,
          audience: this.jwtConfiguration.audience,
          issuer: this.jwtConfiguration.issuer,
        },
      );
    } catch (error) {
      throw new UnauthorizedException();
    }

    try {
      const { sub, sessionId } = payload;
      if (payload.tokenType !== 'refresh') {
        throw new UnauthorizedException();
      }
      const user = await this.userRepository.findOne({
        where: { id: sub },
      });
      if (!user) {
        throw new UnauthorizedException();
      }
      if (!sessionId || payload.sessionMode === 'stateless') {
        return this.generateStatelessTokens(user as User);
      }
      const session = await this.authSessionRepository.findOne({
        where: { id: sessionId, userId: sub, revokedAt: IsNull() },
      });
      if (!session || !session.refreshTokenHash) {
        throw new UnauthorizedException();
      }
      if (session.expiresAt && session.expiresAt < new Date()) {
        throw new UnauthorizedException();
      }
      const validRefreshToken = await this.hashingService.compare(
        refreshTokenDto.refreshToken,
        session.refreshTokenHash,
      );
      if (!validRefreshToken) {
        throw new UnauthorizedException();
      }
      return this.generateToken(user as User, undefined, session);
    } catch (error) {
      if (this.isMissingAuthSessionStore(error)) {
        const user = await this.userRepository.findOne({
          where: { id: payload.sub },
        });
        if (user && payload.tokenType === 'refresh') {
          return this.generateStatelessTokens(user as User);
        }
      }
      throw new UnauthorizedException();
    }
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { loggedOut: true };
    }
    try {
      const payload = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub' | 'sessionId'>
      >(refreshToken, {
        secret: this.jwtConfiguration.secret,
        audience: this.jwtConfiguration.audience,
        issuer: this.jwtConfiguration.issuer,
      });
      if (payload.sessionId) {
        try {
          await this.authSessionRepository.update(
            { id: payload.sessionId, userId: payload.sub },
            { revokedAt: new Date() },
          );
        } catch (error) {
          if (!this.isMissingAuthSessionStore(error)) {
            throw error;
          }
        }
      }
    } catch {
      return { loggedOut: true };
    }
    return { loggedOut: true };
  }

  async logoutAll(userId: string) {
    try {
      await this.authSessionRepository.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    } catch (error) {
      this.throwAuthSessionStoreUnavailable(error, 'logout_all');
    }
    return { loggedOut: true };
  }

  async getAuthenticatedUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['wallet'],
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      authenticated: true,
      user: this.sanitizeUser(user),
    };
  }

  async reauth(userId: string, body: ReauthDto) {
    const user = await this.userRepository.findUserById(userId);
    if (body.password) {
      const validPassword = await this.hashingService.compare(
        body.password,
        user.password,
      );
      if (!validPassword) {
        throw new UnauthorizedException(API_MESSAGES.INVALID_PASSWORD);
      }
      return { authenticated: true };
    }
    const transactionPin = body.pin ?? body.transactionPin;
    if (transactionPin) {
      await this.validateTransactionPin(userId, transactionPin);
      return { authenticated: true };
    }
    throw new BadRequestException('password or pin is required');
  }

  async getSessions(userId: string) {
    let sessions: AuthSession[];

    try {
      sessions = await this.authSessionRepository.find({
        where: { userId, revokedAt: IsNull() },
        order: { lastUsedAt: 'DESC' },
      });
    } catch (error) {
      this.throwAuthSessionStoreUnavailable(error, 'auth_sessions');
    }

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        familyId: session.familyId,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        platform: session.platform,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      })),
    };
  }

  async revokeSession(userId: string, familyId: string) {
    try {
      await this.authSessionRepository.update(
        { userId, familyId },
        { revokedAt: new Date() },
      );
    } catch (error) {
      this.throwAuthSessionStoreUnavailable(error, 'revoke_session');
    }
    return { revoked: true, familyId };
  }

  async revokeOtherSessions(userId: string, sessionId?: string) {
    try {
      const query = this.authSessionRepository
        .createQueryBuilder()
        .update(AuthSession)
        .set({ revokedAt: new Date() })
        .where('userId = :userId', { userId })
        .andWhere('revokedAt IS NULL');
      if (sessionId) {
        query.andWhere('id != :sessionId', { sessionId });
      }
      await query.execute();
    } catch (error) {
      this.throwAuthSessionStoreUnavailable(error, 'revoke_other_sessions');
    }
    return { revokedOthers: true };
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

    if (!pin || !user.pin) {
      throw new PreconditionFailedException(`Invalid transaction pin`);
    }
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

  public async verifyTransactionPinResetCode(userId: string, code: string) {
    const token = await this.tokenService.findOneByTokenAndValidate(
      code,
      TokenType.TRANSACTION_PIN_RESET,
      userId,
    );
    if (!token) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PIN);
    }
    return {
      message: API_MESSAGES.OTP_VERIFIED,
      verificationId: token.id,
    };
  }

  public async setTransactionPinWithCode(
    userId: string,
    body: Record<string, string>,
  ) {
    const code = body.code;
    const pin = body.newPin ?? body.pin;
    if (!code || !pin) {
      throw new BadRequestException('code and newPin are required');
    }
    const token = await this.tokenService.findOneByTokenAndValidate(
      code,
      TokenType.TRANSACTION_PIN_RESET,
      userId,
    );
    if (!token) {
      throw new UnauthorizedException(API_MESSAGES.INVALID_PIN);
    }
    await this.userRepository.findOneAndUpdate(userId, {
      pin: await this.hashingService.hash(pin),
    });
    await this.tokenService.delete(token.id);
    return API_MESSAGES.PIN_SET_SUCCESSFUL;
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
    const resetToken = await this.createPasswordResetToken(
      user,
      verificationToken,
      tokenExpiration,
    );

    // Send OTP via email
    try {
      await this.mailService.sendResetPasswordOTP(user.id, verificationToken);
    } catch (error) {
      if (resetToken?.id) {
        try {
          await this.tokenService.delete(resetToken.id);
        } catch {
          // The reset token expires quickly; cleanup failure should not hide the delivery error.
        }
      }
      this.throwPasswordResetEmailUnavailable(error);
    }

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
      if (!lastLogin) {
        throw new UnauthorizedException(API_MESSAGES.ACCOUNT_DEACTIVATED);
      }
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

  private async createAuthSession(user: User, request?: Request) {
    const metadata = this.getRequestMetadata(request);
    return this.authSessionRepository.save(
      this.authSessionRepository.create({
        userId: user.id,
        familyId: randomUUID(),
        refreshTokenHash: null,
        deviceId: metadata.deviceId,
        deviceName: metadata.deviceName,
        platform: metadata.platform,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        lastUsedAt: new Date(),
        expiresAt: new Date(
          Date.now() + this.jwtConfiguration.refreshAccessTokenTtl * 1000,
        ),
      }),
    );
  }

  private getRequestMetadata(request?: Request) {
    return {
      deviceId: this.readHeader(request, 'x-device-id'),
      deviceName: this.readHeader(request, 'x-device-name'),
      platform: this.readHeader(request, 'x-platform'),
      ipAddress:
        this.readHeader(request, 'x-forwarded-for') ??
        request?.ip ??
        request?.socket?.remoteAddress ??
        null,
      userAgent: request?.headers?.['user-agent']?.toString() ?? null,
    };
  }

  private readHeader(request: Request | undefined, name: string) {
    const value = request?.headers?.[name];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private sanitizeUser(user: User) {
    const { password, pin, resetToken, resetTokenExpiry, ...safeUser } = user;
    return safeUser;
  }

  private throwAuthSessionStoreUnavailable(
    error: unknown,
    feature: string,
  ): never {
    if (this.isMissingAuthSessionStore(error)) {
      throw new ServiceUnavailableException({
        code: 'AUTH_SESSION_STORE_UNAVAILABLE',
        message:
          'Session management is unavailable because the auth session store is not present in the connected database.',
        feature,
        capability: 'auth_sessions',
        reason:
          'The deployed backend is running against an existing database that has not been upgraded with the auth_session table.',
        missingRequirements: ['auth_session table'],
        provider: 'VidalPay',
        retryable: false,
      });
    }

    throw error;
  }

  private isMissingAuthSessionStore(error: unknown) {
    const candidate = error as {
      code?: string;
      message?: string;
      driverError?: { code?: string; message?: string };
    };
    const code = candidate?.driverError?.code ?? candidate?.code;
    const message = `${candidate?.driverError?.message ?? ''} ${candidate?.message ?? ''}`;

    return (
      code === '42P01' ||
      code === 'ER_NO_SUCH_TABLE' ||
      (/auth_session/i.test(message) &&
        /does not exist|no such table/i.test(message))
    );
  }

  private async createPasswordResetToken(
    user: User,
    verificationToken: string,
    tokenExpiration: Date,
  ) {
    try {
      return await this.tokenService.create({
        token: verificationToken,
        expiration: tokenExpiration,
        type: TokenType.PASSWORD_RESET,
        user,
      });
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_TOKEN_STORE_UNAVAILABLE',
        message:
          'Password reset is temporarily unavailable. Please try again later or contact support.',
        feature: 'password_reset',
        capability: 'password_reset_otp',
        reason:
          'The backend could not save a password reset OTP for this account.',
        missingRequirements: this.passwordResetStoreMissingRequirements(error),
        provider: 'VidalPay',
        retryable: false,
      });
    }
  }

  private throwPasswordResetEmailUnavailable(error: unknown): never {
    throw new ServiceUnavailableException({
      code: 'PASSWORD_RESET_EMAIL_UNAVAILABLE',
      message:
        'We could not send the password reset OTP right now. Please try again later or contact support.',
      feature: 'password_reset',
      capability: 'password_reset_email_otp',
      reason: this.serviceUnavailableReason(
        error,
        'Email delivery failed or is not configured.',
      ),
      missingRequirements: this.missingEmailConfiguration(),
      provider: this.emailProviderName(),
      retryable: this.missingEmailConfiguration().length === 0,
    });
  }

  private passwordResetStoreMissingRequirements(error: unknown) {
    const code = this.errorCode(error);
    const message = this.errorMessage(error);

    if (
      code === '22P02' ||
      /password_reset/i.test(message) ||
      /enum/i.test(message)
    ) {
      return ['token.type enum value password_reset'];
    }

    if (
      code === '42P01' ||
      /relation .*token.* does not exist/i.test(message)
    ) {
      return ['token table'];
    }

    if (code === '42703' || /column .*type.* does not exist/i.test(message)) {
      return ['token.type column'];
    }

    return ['password reset token storage'];
  }

  private missingEmailConfiguration() {
    if (this.firstEnv(['RESEND_API_KEY'])) {
      const missing: string[] = [];

      if (
        !this.firstEnv([
          'RESEND_FROM_EMAIL',
          'SMTP_FROM_EMAIL',
          'SMTP_MAIL_FROM',
          'MAIL_FROM',
          'EMAIL_FROM',
          'FROM_EMAIL',
          'SENDGRID_FROM_EMAIL',
        ])
      ) {
        missing.push(
          'RESEND_FROM_EMAIL or SMTP_MAIL_FROM or EMAIL_FROM or FROM_EMAIL',
        );
      }

      return missing;
    }

    const missing: string[] = [];
    const host = this.firstEnv([
      'SMTP_MAIL_HOST',
      'SMTP_HOST',
      'MAIL_HOST',
      'EMAIL_HOST',
    ]);

    if (!host) {
      missing.push('SMTP_MAIL_HOST or SMTP_HOST or MAIL_HOST or EMAIL_HOST');
    } else if (
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase()) &&
      process.env.SMTP_ALLOW_LOCALHOST !== 'true'
    ) {
      missing.push(
        'SMTP host must be a remote SMTP hostname, not localhost or 127.0.0.1',
      );
    }

    if (
      !this.firstEnv([
        'SMTP_MAIL_USERNAME',
        'SMTP_MAIL_USER',
        'SMTP_USERNAME',
        'SMTP_USER',
        'MAIL_USERNAME',
        'MAIL_USER',
        'EMAIL_USERNAME',
        'EMAIL_USER',
      ])
    ) {
      missing.push(
        'SMTP_MAIL_USERNAME or SMTP_MAIL_USER or SMTP_USER or MAIL_USER',
      );
    }

    if (
      !this.firstEnv([
        'SMTP_MAIL_PASSWORD',
        'SMTP_MAIL_PASS',
        'SMTP_PASSWORD',
        'SMTP_PASS',
        'MAIL_PASSWORD',
        'MAIL_PASS',
        'EMAIL_PASSWORD',
        'EMAIL_PASS',
      ])
    ) {
      missing.push(
        'SMTP_MAIL_PASSWORD or SMTP_MAIL_PASS or SMTP_PASS or MAIL_PASS',
      );
    }

    return missing;
  }

  private emailProviderName() {
    return this.firstEnv(['RESEND_API_KEY']) ? 'Resend' : 'SMTP';
  }

  private firstEnv(names: string[]) {
    for (const name of names) {
      const value = process.env[name]?.trim();
      if (value) {
        return value;
      }
    }

    return null;
  }

  private serviceUnavailableReason(error: unknown, fallback: string) {
    const response = error as {
      response?: { reason?: string; code?: string; message?: string };
    };

    return (
      response?.response?.reason ??
      response?.response?.message ??
      this.errorMessage(error) ??
      fallback
    );
  }

  private errorCode(error: unknown) {
    const candidate = error as {
      code?: string;
      driverError?: { code?: string };
    };

    return candidate?.driverError?.code ?? candidate?.code ?? null;
  }

  private errorMessage(error: unknown) {
    const candidate = error as {
      message?: string;
      driverError?: { message?: string };
    };

    return `${candidate?.driverError?.message ?? ''} ${
      candidate?.message ?? ''
    }`.trim();
  }

  private async findUserByEmailOrPhoneVariants(value: string) {
    if (value.includes('@')) {
      return this.userRepository.findUserByEmailOrPhone(value);
    }

    return this.findUserByPhoneVariants(value);
  }

  private async findUserByPhoneVariants(phoneNumber: string) {
    const variants = this.phoneNumberVariants(phoneNumber);

    for (const variant of variants) {
      const user = await this.userRepository.findUserByPhone(variant);
      if (user) {
        return user;
      }
    }

    return null;
  }

  private phoneNumberVariants(phoneNumber: string) {
    const compact = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const digits = compact.replace(/\D/g, '');
    const variants = [
      compact,
      this.normalizePhoneNumberForRegion(phoneNumber),
      this.normalizePhoneNumberForRegion(phoneNumber, 'US'),
      this.normalizePhoneNumberForRegion(phoneNumber, 'NG'),
      digits,
      digits ? `+${digits}` : null,
    ].filter((value): value is string => Boolean(value));

    return [...new Set(variants)];
  }

  private normalizePhoneNumberForRegion(
    phoneNumber: string,
    countryCode?: string,
    country?: string,
  ) {
    const compact = phoneNumber.replace(/[\s\-\(\)]/g, '');
    const digits = compact.replace(/\D/g, '');
    const region = this.inferRegion(countryCode, country, compact);

    if (!digits) {
      return compact;
    }

    if (compact.startsWith('+')) {
      return `+${digits}`;
    }

    if (region === 'US') {
      if (digits.length === 10) {
        return `+1${digits}`;
      }
      if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
      }
    }

    if (region === 'NG') {
      if (digits.length === 10 && /^[789]/.test(digits)) {
        return `+234${digits}`;
      }
      if (digits.length === 11 && digits.startsWith('0')) {
        return `+234${digits.slice(1)}`;
      }
      if (digits.length === 13 && digits.startsWith('234')) {
        return `+${digits}`;
      }
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    if (digits.length === 13 && digits.startsWith('234')) {
      return `+${digits}`;
    }

    return compact;
  }

  private inferRegion(
    countryCode?: string,
    country?: string,
    phone?: string,
  ): string | undefined {
    const candidates = [countryCode, country]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    if (
      candidates.some((value) =>
        ['ng', 'nigeria', '+234', '234'].includes(value),
      ) ||
      phone?.startsWith('+234')
    ) {
      return 'NG';
    }
    if (
      candidates.some((value) =>
        ['us', 'usa', 'united states', 'united_states', '+1', '1'].includes(
          value,
        ),
      ) ||
      phone?.startsWith('+1')
    ) {
      return 'US';
    }
    return undefined;
  }
}
