import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { BeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Controller('beneficiary')
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  @Get('me')
  async getUserBeneficiary(
    @ActiveUser() user: ActiveUserData,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return this.beneficiaryService.getBeneficiaryForSingleUser(
      pageOptionsDto,
      user.sub,
    );
  }

  @Post()
  create(
    @Body() createBeneficiaryDto: CreateBeneficiaryDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.beneficiaryService.create(createBeneficiaryDto, user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.beneficiaryService.deleteBeneficiary(id, user.sub);
  }
}
