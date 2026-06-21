import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { AccountStatus } from 'src/database/entities/user.entity';
import { KycStatus } from 'src/common/enum/kyc-status.enum';
import { UserRole } from 'src/utils/enums/user.enum';

export class AdminReasonDto {
  @IsString()
  @Length(10, 1000)
  reason: string;
}

export class AdminRoleChangeDto extends AdminReasonDto {
  @IsEnum(UserRole)
  role: UserRole;
}

export class AdminKycDecisionDto extends AdminReasonDto {
  @IsIn([KycStatus.VERIFIED, KycStatus.REJECTED, KycStatus.REQUIRES_ACTION])
  status: KycStatus.VERIFIED | KycStatus.REJECTED | KycStatus.REQUIRES_ACTION;
}

export class AdminUserListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 50;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(KycStatus)
  @IsOptional()
  kycStatus?: KycStatus;
}
