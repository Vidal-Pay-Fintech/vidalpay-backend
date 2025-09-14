import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { BeneficiaryService } from './beneficiary.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';

@Controller('beneficiary')
export class BeneficiaryController {
  constructor(private readonly beneficiaryService: BeneficiaryService) {}

  @Get('me')
  async getUserBeneficiary(
    @ActiveUser() user: ActiveUserData,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return await this.beneficiaryService.getBeneficiaryForSingleUser(
      pageOptionsDto,
      user.sub,
    );
  }

  // @Delete()
  // deleteSingleBeneficiary(@Body() createBeneficiaryDto: CreateBeneficiaryDto) {
  //   return this.beneficiaryService.deleteBeneficiary();
  // }

  @Post()
  create(@Body() createBeneficiaryDto: CreateBeneficiaryDto) {
    return this.beneficiaryService.create(createBeneficiaryDto);
  }

  @Get()
  findAll() {
    return this.beneficiaryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.beneficiaryService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateBeneficiaryDto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiaryService.update(+id, updateBeneficiaryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.beneficiaryService.remove(+id);
  }
}
