import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { PushPlatform } from '../push-notification.enums';

export class RegisterPushDeviceDto {
  @IsString()
  @Length(8, 255)
  subscriptionId: string;

  @IsEnum(PushPlatform)
  platform: PushPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsObject()
  topics?: Record<string, boolean>;
}
