import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  getMe(@ActiveUser() user: ActiveUserData) {
    return this.userService.getMe(user.sub);
  }

  @Patch('profile')
  updateProfile(
    @ActiveUser() user: ActiveUserData,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.sub, updateProfileDto);
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
  @UseInterceptors(FilesInterceptor('files', 5, buildKycUploadOptions()))
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
