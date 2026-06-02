import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { DemoKycSubmitDto } from './dto/demo-kyc-submit.dto';
import { KycDemoService } from './kyc-demo.service';

@ApiTags('KYC')
@Controller('kyc')
export class KycDemoController {
  constructor(private readonly kycDemoService: KycDemoService) {}

  @Post('demo/submit')
  submitDemoKyc(
    @ActiveUser() user: ActiveUserData,
    @Body() demoKycSubmitDto: DemoKycSubmitDto,
  ) {
    return this.kycDemoService.submit(user.sub, demoKycSubmitDto);
  }

  @Get('status')
  getStatus(@ActiveUser() user: ActiveUserData) {
    return this.kycDemoService.getStatus(user.sub);
  }
}
