import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import {
  CreateLoanApplicationDto,
  CreateLoanRepaymentDto,
  LoanIdempotentDto,
  RequestLoanEligibilityDto,
} from './dto/loan-request.dto';
import { LoanService } from './loan.service';

@Controller('loans')
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.loanService.getOverview(user.sub);
  }

  @Get('eligibility')
  getEligibility(@ActiveUser() user: ActiveUserData) {
    return this.loanService.getEligibility(user.sub);
  }

  @Post('eligibility')
  requestEligibility(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: RequestLoanEligibilityDto,
  ) {
    return this.loanService.requestEligibility(user.sub, dto);
  }

  @Get('applications')
  listApplications(@ActiveUser() user: ActiveUserData) {
    return this.loanService.listApplications(user.sub);
  }

  @Post('applications')
  createApplication(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateLoanApplicationDto,
  ) {
    return this.loanService.createApplication(user.sub, dto);
  }

  @Get('applications/:id')
  getApplication(
    @ActiveUser() user: ActiveUserData,
    @Param('id') applicationId: string,
  ) {
    return this.loanService.getApplication(user.sub, applicationId);
  }

  @Post('applications/:id/withdraw')
  withdrawApplication(
    @ActiveUser() user: ActiveUserData,
    @Param('id') applicationId: string,
  ) {
    return this.loanService.withdrawApplication(user.sub, applicationId);
  }

  @Get('offers')
  listOffers(@ActiveUser() user: ActiveUserData) {
    return this.loanService.listOffers(user.sub);
  }

  @Post('offers/:id/accept')
  acceptOffer(
    @ActiveUser() user: ActiveUserData,
    @Param('id') offerId: string,
    @Body() dto: LoanIdempotentDto,
  ) {
    return this.loanService.acceptOffer(user.sub, offerId, dto);
  }

  @Post('offers/:id/decline')
  declineOffer(
    @ActiveUser() user: ActiveUserData,
    @Param('id') offerId: string,
  ) {
    return this.loanService.declineOffer(user.sub, offerId);
  }

  @Get()
  listLoans(@ActiveUser() user: ActiveUserData) {
    return this.loanService.listLoans(user.sub);
  }

  @Get(':id')
  getLoan(@ActiveUser() user: ActiveUserData, @Param('id') loanId: string) {
    return this.loanService.getLoan(user.sub, loanId);
  }

  @Post(':id/repayments')
  repay(
    @ActiveUser() user: ActiveUserData,
    @Param('id') loanId: string,
    @Body() dto: CreateLoanRepaymentDto,
  ) {
    return this.loanService.repay(user.sub, loanId, dto);
  }
}
