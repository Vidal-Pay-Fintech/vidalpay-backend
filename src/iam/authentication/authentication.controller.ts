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

@ApiTags('Authentication')
@Auth(AuthType.None) // route with no auth guard
@Controller('auth')
export class AuthenticationController {
  constructor(private readonly authService: AuthenticationService) {}

  @Post('sign-up')
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp(signUpDto);
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
  ) {
    const res = this.authService.signIn(signInDto);
    response.cookie('token', (await res).accessToken, {
      expires: new Date(new Date().getTime() + 30 * 1000),
      httpOnly: true,
      sameSite: 'strict',
    });
    return res;
  }

  @HttpCode(HttpStatus.OK)
  @Post('admin/login')
  async adminSignIn(
    @Res({ passthrough: true }) response: Response,
    @Body() signInDto: SignInDto,
  ) {
    const res = this.authService.adminSignIn(signInDto);
    response.cookie('token', (await res).accessToken, {
      expires: new Date(new Date().getTime() + 30 * 1000),
      httpOnly: true,
      sameSite: 'strict',
    });
    return res;
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return await this.authService.refreshToken(refreshTokenDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forget-password')
  async sendResetPasswordLink(
    @Body() resetPasswordLinkDto: ResetPasswordLinkDto,
  ) {
    return await this.authService.sendResetPasswordLink(resetPasswordLinkDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

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
}
