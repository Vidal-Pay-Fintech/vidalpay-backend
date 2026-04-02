import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { KycDocumentStage } from 'src/common/enum/kyc-document.enum';

export class UploadKycDocumentsDto {
  @IsOptional()
  @IsEnum(KycDocumentStage)
  stage?: KycDocumentStage;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  metadata?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileUrls?: string[];
}
