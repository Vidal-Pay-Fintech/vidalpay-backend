import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertKycIdentityDto } from './dto/upsert-kyc-identity.dto';
import { UpsertKycAddressDto } from './dto/upsert-kyc-address.dto';
import { UpsertKycLivenessDto } from './dto/upsert-kyc-liveness.dto';
import { UploadKycDocumentsDto } from './dto/upload-kyc-documents.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { buildKycUploadOptions } from './kyc-upload.config';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { VerifyEmailChangeDto } from './dto/verify-email-change.dto';
import { RequestPhoneChangeDto } from './dto/request-phone-change.dto';
import { VerifyPhoneChangeDto } from './dto/verify-phone-change.dto';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@ActiveUser() user: ActiveUserData) {
    return this.userService.getMe(user.sub);
  }

  @Get('home')
  getHome(@ActiveUser() user: ActiveUserData) {
    return this.userService.getHomeOverview(user.sub);
  }

  @Patch('profile')
  updateProfile(
    @ActiveUser() user: ActiveUserData,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.sub, updateProfileDto);
  }

  @Get('security')
  getSecurity(@ActiveUser() user: ActiveUserData) {
    return this.userService.getSecurityOverview(user.sub);
  }

  @Post('security/change-email/request')
  requestEmailChange(
    @ActiveUser() user: ActiveUserData,
    @Body() requestEmailChangeDto: RequestEmailChangeDto,
  ) {
    return this.userService.requestEmailChange(user.sub, requestEmailChangeDto);
  }

  @Post('security/change-email/verify')
  verifyEmailChange(
    @ActiveUser() user: ActiveUserData,
    @Body() verifyEmailChangeDto: VerifyEmailChangeDto,
  ) {
    return this.userService.verifyEmailChange(user.sub, verifyEmailChangeDto);
  }

  @Post('security/change-phone/request')
  requestPhoneChange(
    @ActiveUser() user: ActiveUserData,
    @Body() requestPhoneChangeDto: RequestPhoneChangeDto,
  ) {
    return this.userService.requestPhoneChange(user.sub, requestPhoneChangeDto);
  }

  @Post('security/change-phone/verify')
  verifyPhoneChange(
    @ActiveUser() user: ActiveUserData,
    @Body() verifyPhoneChangeDto: VerifyPhoneChangeDto,
  ) {
    return this.userService.verifyPhoneChange(user.sub, verifyPhoneChangeDto);
  }

  @Get('kyc')
  getKyc(@ActiveUser() user: ActiveUserData) {
    return this.userService.getKyc(user.sub);
  }

  @Post('kyc/identity')
  saveKycIdentity(
    @ActiveUser() user: ActiveUserData,
    @Body() upsertKycIdentityDto: UpsertKycIdentityDto,
  ) {
    return this.userService.saveKycIdentity(user.sub, upsertKycIdentityDto);
  }

  @Post('kyc/address')
  saveKycAddress(
    @ActiveUser() user: ActiveUserData,
    @Body() upsertKycAddressDto: UpsertKycAddressDto,
  ) {
    return this.userService.saveKycAddress(user.sub, upsertKycAddressDto);
  }

  @Post('kyc/liveness')
  saveKycLiveness(
    @ActiveUser() user: ActiveUserData,
    @Body() upsertKycLivenessDto: UpsertKycLivenessDto,
  ) {
    return this.userService.saveKycLiveness(user.sub, upsertKycLivenessDto);
  }

  @Post('kyc/documents')
  @UseInterceptors(AnyFilesInterceptor(buildKycUploadOptions()))
  saveKycDocuments(
    @ActiveUser() user: ActiveUserData,
    @UploadedFiles() files: Array<any>,
    @Body() uploadKycDocumentsDto: UploadKycDocumentsDto,
  ) {
    return this.userService.saveKycDocuments(
      user.sub,
      files,
      uploadKycDocumentsDto,
    );
  }

  @Post('kyc/submit')
  submitKyc(
    @ActiveUser() user: ActiveUserData,
    @Body() submitKycDto: SubmitKycDto,
  ) {
    return this.userService.submitKyc(user.sub, submitKycDto);
  }
}
