import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { VidalpayService } from 'src/vidalpay/vidalpay.service';

@Controller('user')
export class UserController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('me')
  me(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCurrentUser(user.sub);
  }

  @Get('home')
  home(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getHomeOverview(user.sub);
  }

  @Get('security')
  security(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getSecurityOverview(user.sub);
  }

  @Patch('profile')
  updateProfile(@ActiveUser() user: ActiveUserData, @Body() body: Record<string, unknown>) {
    return this.vidalpayService.updateProfile(user.sub, body);
  }

  @Post('security/change-email/request')
  requestEmailChange(
    @ActiveUser() user: ActiveUserData,
    @Body('newEmail') newEmail: string,
  ) {
    return this.vidalpayService.requestEmailChange(user.sub, newEmail);
  }

  @Post('security/change-email/verify')
  verifyEmailChange(
    @ActiveUser() user: ActiveUserData,
    @Body('token') token: string,
  ) {
    return this.vidalpayService.verifyEmailChange(user.sub, token);
  }

  @Post('security/change-phone/request')
  requestPhoneChange(
    @ActiveUser() user: ActiveUserData,
    @Body('newPhoneNumber') newPhoneNumber: string,
  ) {
    return this.vidalpayService.requestPhoneChange(user.sub, newPhoneNumber);
  }

  @Post('security/change-phone/verify')
  verifyPhoneChange(
    @ActiveUser() user: ActiveUserData,
    @Body('token') token: string,
  ) {
    return this.vidalpayService.verifyPhoneChange(user.sub, token);
  }

  @Post('account/closure')
  closeAccount(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.closeAccount(user.sub, body);
  }

  @Post('account/deletion')
  requestAccountDeletion(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.requestAccountDeletion(user.sub, body);
  }

  @Get('scheduled-transfers')
  scheduledTransfers(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.listScheduledTransfers(user.sub);
  }

  @Post('scheduled-transfers')
  createScheduledTransfer(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.createScheduledTransfer(user.sub, body);
  }

  @Post('kyc/submit')
  submitKyc(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.submitKycProfile(user.sub, body);
  }

  @Post('kyc/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadKycDocument(
    @ActiveUser() user: ActiveUserData,
    @UploadedFile() file: any,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.uploadKycDocument(user.sub, {
      ...body,
      fileName: file?.originalname,
      mimeType: file?.mimetype,
    });
  }

  @Post('kyc/identity')
  submitKycIdentity(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.submitKycSection(
      user.sub,
      'GOVERNMENT_ID',
      body,
    );
  }

  @Post('kyc/address')
  submitKycAddress(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.submitKycSection(user.sub, 'ADDRESS', body);
  }

  @Post('kyc/liveness')
  submitKycLiveness(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.submitKycSection(user.sub, 'LIVENESS', body);
  }
}
