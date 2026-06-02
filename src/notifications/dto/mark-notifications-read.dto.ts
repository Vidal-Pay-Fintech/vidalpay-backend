import { IsArray, IsOptional, IsString } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  notificationIds?: string[];
}
