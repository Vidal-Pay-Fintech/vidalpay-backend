import { Injectable } from '@nestjs/common';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { BeneficiaryRepository } from 'src/database/repositories/beneficiary.repository';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { DeleteBeneficiaryDto } from 'src/wallet/dto/delete-beneficiary.dto';

@Injectable()
export class BeneficiaryService {
  constructor(private readonly beneficiaryRepository: BeneficiaryRepository) {}
  create(createBeneficiaryDto: CreateBeneficiaryDto) {
    return 'This action adds a new beneficiary';
    //get
    //delete
    //findIfBeneficiaryExist
  }

  async getBeneficiaryForSingleUser(
    pageOptionsDto: PageOptionsDto,
    userId: string,
  ) {
    const res = await this.beneficiaryRepository.getUserBeneficiaries(
      pageOptionsDto,
      userId,
    );
    return res;
  }

  async deleteBeneficiary(deleteBeneficiaryDto: DeleteBeneficiaryDto) {
    try {
      await this.beneficiaryRepository.deleteBeneficiary(
        deleteBeneficiaryDto.beneficiaryId,
        deleteBeneficiaryDto.senderId,
      );

      return {
        status: true,
        code: 200,
        message: 'Beneficiary deleted successfully',
        data: {
          beneficiaryId: deleteBeneficiaryDto.beneficiaryId,
          deletedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  findAll() {
    return `This action returns all beneficiary`;
  }

  findOne(id: number) {
    return `This action returns a #${id} beneficiary`;
  }

  update(id: number, updateBeneficiaryDto: UpdateBeneficiaryDto) {
    return `This action updates a #${id} beneficiary`;
  }

  remove(id: number) {
    return `This action removes a #${id} beneficiary`;
  }
}
