import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SupportTicketPriority,
} from 'src/database/entities/support-ticket.entity';

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  category: string;

  @IsString()
  @MinLength(5)
  @MaxLength(160)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  preferredChannel?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
