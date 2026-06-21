import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Req,
  UseGuards,
  Param,
  Query,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { Response } from 'express';
import { AuthType } from './enums/auth-type.enum';
import { Auth } from './decorators/auth.decorator';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyUserDto } from './dto/verifyUser.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordLinkDto } from './dto/resetPasswordLinkDto.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ResendPhoneOtpDto } from './dto/resend-phone-otp.dto';
import { ActiveUserData } from '../interfaces/active-user-data-interfaces';
import { ActiveUser } from '../decorators/active-user.decorator';
import { ResetTransactionPinDto } from './dto/reset-pin.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { ApiTags } from '@nestjs/swagger';
import { CreateTransactionPinDto } from './dto/create-transaction-pin.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { VerifyPasswordResetOtpDto } from './dto/verify-password-resetotp.dto';
import { ResetPasswordAfterOtpDto } from './dto/reset-password-afterotp-verification.dto';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/iam/decorators/roles.decorator';

@ApiTags('Authentication')
@Auth(AuthType.None) // route with no auth guard
@Controller('auth')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  @Post('sign-up')
  signUp(@Body() signUpDto: SignUpDto, @Req() request: Request) {
    return this.authService.signUp(signUpDto, {
      ipCountryCode: this.getTrustedIpCountryCode(request),
      session: this.getSessionContext(request),
    });
  }

  private getTrustedIpCountryCode(request: Request): string | null {
    const headerName =
      process.env.TRUSTED_IP_COUNTRY_HEADER?.trim().toLowerCase();
    if (!headerName) {
      return null;
    }

    const headerValue = request.headers[headerName];
    return Array.isArray(headerValue)
      ? (headerValue[0] ?? null)
      : (headerValue ?? null);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyUserEmail(@Body() verifyUserDto: VerifyUserDto) {
    return await this.authService.verifyUserEmail(verifyUserDto.token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-phone')
  async verifyPhoneNumber(@Body() verifyUserDto: VerifyUserDto) {
    return await this.authService.verifyPhone(verifyUserDto.token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-otp')
  async resendEmailVerificationOtp(@Body() resendOtpDto: ResendOtpDto) {
    return await this.authService.resendVerificationEmail(resendOtpDto.email);
  }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('create-transaction-pin')
  async createTransactionPin(
    @Body() createTransactionPinDto: CreateTransactionPinDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.authService.createTransactionPin(
      createTransactionPinDto.pin,
      user.sub,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-otp-phone')
  async resendPhoneVerificationOtp(
    @Body() resendPhoneOtpDto: ResendPhoneOtpDto,
  ) {
    return await this.authService.resendVerificationPhone(
      resendPhoneOtpDto.phone,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(
    @Res({ passthrough: true }) response: Response,
    @Body() signInDto: SignInDto,
    @Req() request: Request,
  ) {
    const res = this.authService.signIn(
      signInDto,
      this.getSessionContext(request),
    );
    response.cookie('token', (await res).accessToken, {
      expires: new Date(new Date().getTime() + 30 * 1000),
      httpOnly: true,
      sameSite: 'strict',
    });
    return res;
  }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Get('me')
  async getLoginUserdetails(@ActiveUser() user: ActiveUserData) {
    return await this.authService.getUserById(user.sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('admin/login')
  async adminSignIn(
    @Res({ passthrough: true }) response: Response,
    @Body() signInDto: SignInDto,
    @Req() request: Request,
  ) {
    const res = this.authService.adminSignIn(
      signInDto,
      this.getSessionContext(request),
    );
    response.cookie('token', (await res).accessToken, {
      expires: new Date(new Date().getTime() + 30 * 1000),
      httpOnly: true,
      sameSite: 'strict',
    });
    return res;
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: Request,
  ) {
    return await this.authService.refreshToken(
      refreshTokenDto,
      this.getSessionContext(request),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.logout(refreshTokenDto);
  }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(@ActiveUser() user: ActiveUserData) {
    return this.authService.logoutAll(user.sub);
  }

  @Auth(AuthType.Bearer)
  @Get('sessions')
  listSessions(@ActiveUser() user: ActiveUserData) {
    return this.authService.listSessions(user.sub, user.familyId);
  }

  @Auth(AuthType.Bearer)
  @Post('sessions/:familyId/revoke')
  revokeSession(
    @ActiveUser() user: ActiveUserData,
    @Param('familyId') familyId: string,
  ) {
    return this.authService.revokeSession(user.sub, familyId);
  }

  @Auth(AuthType.Bearer)
  @Post('sessions/revoke-others')
  revokeOtherSessions(@ActiveUser() user: ActiveUserData) {
    return this.authService.revokeOtherSessions(user.sub, user.familyId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forget-password')
  async sendResetPasswordLink(
    @Body() resetPasswordLinkDto: ResetPasswordLinkDto,
  ) {
    return await this.authService.sendResetPasswordLink(resetPasswordLinkDto);
  }

  // @HttpCode(HttpStatus.OK)
  // @Post('reset-password')
  // async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
  //   return this.authService.resetPassword(resetPasswordDto);
  // }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('request-reset-pin')
  async requestTransactionPinReset(@ActiveUser() user: ActiveUserData) {
    return this.authService.requestTransactionPinReset(user.sub);
  }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('reset-pin')
  async resetTransactionPin(
    @Body() resetTransactionPinDto: ResetTransactionPinDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.authService.resetTransactionPin(
      resetTransactionPinDto,
      user.sub,
    );
  }

  // Step 1: POST /auth/password-reset/request
  @Post('password-reset/request')
  async requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  // Step 2: POST /auth/password-reset/verify-otp
  @Post('password-reset/verify-otp')
  async verifyOtp(@Body() dto: VerifyPasswordResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto);
  }

  // Step 3: POST /auth/password-reset/complete
  @Post('password-reset/complete')
  async resetPassword(@Body() dto: ResetPasswordAfterOtpDto) {
    return this.authService.resetPasswordWithVerifiedOtp(dto);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Starts the Google OAuth2 flow
  }

  // @Get('google/callback')
  // @UseGuards(AuthGuard('google'))
  // googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
  //   const userInfo: any = req.user;
  //   console.log(userInfo, 'THE USER INFO');
  //   const { accessToken, refreashToken } = userInfo;
  //   return res.redirect(
  //     `${process.env.FRONTEND_URL}/auth/login?accessToken=${accessToken}&refreshToken=${refreashToken}&email?${userInfo?.user?.email}&firstName=${userInfo?.user.firstName}&lastName=${userInfo?.user.lastName}`,
  //   );
  // }

  @Auth(AuthType.Bearer)
  @Post('deactivate-account')
  async deactivateAccount(
    @ActiveUser() user: ActiveUserData,
    @Body() deactivateAccountDto: DeactivateAccountDto,
  ) {
    return this.authService.deactivateAccount(deactivateAccountDto, user.sub);
  }

  @Auth(AuthType.Bearer)
  @Get('validate-token/:token')
  async validateToken(@Param('token') token: string) {
    return this.authService.validateToken(token);
  }

  @Auth(AuthType.Bearer)
  @HttpCode(HttpStatus.OK)
  @Post('validate-transaction-pin')
  async validateTransactionPin(
    @Body() createTransactionPinDto: CreateTransactionPinDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return await this.authService.validateTransactionPin(
      user.sub,
      createTransactionPinDto.pin,
    );
  }

  @Auth(AuthType.Bearer)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.CUSTOMER_SUPPORT)
  @HttpCode(HttpStatus.OK)
  @Get('get-users-by-query')
  async getUsersByQuery(@Query() pageOptionsDto: PageOptionsDto) {
    return await this.authService.findAllUsers(pageOptionsDto);
  }

  private getSessionContext(request: Request) {
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    return {
      deviceId: header('x-device-id')?.slice(0, 100) ?? null,
      deviceName: header('x-device-name')?.slice(0, 100) ?? null,
      userAgent: header('user-agent')?.slice(0, 500) ?? null,
      ipAddress: request.ip?.slice(0, 64) ?? null,
    };
  }
}
