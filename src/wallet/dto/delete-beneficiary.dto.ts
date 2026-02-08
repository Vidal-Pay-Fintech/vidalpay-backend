import { IsString } from 'class-validator';

export class DeleteBeneficiaryDto {
  @IsString()
  beneficiaryId: string;

  @IsString()
  senderId: string;
}
