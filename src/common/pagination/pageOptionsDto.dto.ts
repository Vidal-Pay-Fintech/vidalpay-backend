import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum Order {
  ASC = 'ASC',
  DESC = 'DESC',
}

export enum ReportType {
  FINANCIAL = 'financial',
  USERS = 'users',
  WALLET = 'wallet',
  GAME = 'game',
  SUPPORT = 'support',
  ENGAGEMENT = 'engagement',
}

export enum ReportRange {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

export class PageOptionsDto {
  @IsEnum(Order)
  @IsOptional()
  readonly order?: Order;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  readonly page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  readonly limit?: number = 50;

  @IsString()
  @IsOptional()
  readonly from?: string = '';

  @IsString()
  @IsOptional()
  readonly to?: string = '';

  @IsEnum(ReportType)
  @IsOptional()
  readonly reportType?: ReportType;

  @IsEnum(ReportRange)
  @IsOptional()
  readonly reportRange?: ReportRange = ReportRange.MONTHLY;

  @IsString()
  @IsOptional()
  readonly drawType?: string = '';

  @IsString()
  @IsOptional()
  readonly noOfStakes?: string = '';

  @IsString()
  @IsOptional()
  readonly categoryName?: string = '';

  @IsString()
  @IsOptional()
  readonly payoutMin?: string = '';

  @IsString()
  @IsOptional()
  readonly payoutMax?: string = '';

  @IsString()
  @IsOptional()
  readonly search?: string = '';

  @IsString()
  @IsOptional()
  readonly status?: string = '';

  @IsString()
  @IsOptional()
  readonly transactionType?: string = '';

  @IsString()
  @IsOptional()
  readonly userId?: string = '';

  @IsString()
  @IsOptional()
  readonly role?: string = '';

  @IsString()
  @IsOptional()
  readonly isExport?: string = '';

  constructor() {
    // Only set default values if not provided (useful when receiving inputs from requests)
    this.order = this.order || Order.DESC;
    this.limit = Number(this.limit) || 50;
    this.page = Number(this.page) || 1;
  }

  get skip(): number {
    console.log('THE SKIP', this.page, this.limit);
    // Ensure skip calculation returns a valid number, even if `page` or `limit` is undefined.
    const page = Number(this.page) || 1;
    const limit = Number(this.limit) || 50;
    return (page - 1) * limit;
  }
}
