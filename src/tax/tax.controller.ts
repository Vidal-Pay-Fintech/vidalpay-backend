import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import {
  CreateTaxFilingDto,
  RegisterTaxDocumentDto,
  TaxIdempotentDto,
} from './dto/tax-request.dto';
import { TaxService } from './tax.service';

@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.taxService.getOverview(user.sub);
  }

  @Get('account')
  getAccount(@ActiveUser() user: ActiveUserData) {
    return this.taxService.getAccount(user.sub);
  }

  @Post('account')
  openAccount(@ActiveUser() user: ActiveUserData) {
    return this.taxService.openAccount(user.sub);
  }

  @Get('filings')
  listFilings(@ActiveUser() user: ActiveUserData) {
    return this.taxService.listFilings(user.sub);
  }

  @Post('filings')
  createFiling(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateTaxFilingDto,
  ) {
    return this.taxService.createFiling(user.sub, dto);
  }

  @Get('filings/:id')
  getFiling(@ActiveUser() user: ActiveUserData, @Param('id') filingId: string) {
    return this.taxService.getFiling(user.sub, filingId);
  }

  @Post('filings/:id/session')
  createSession(
    @ActiveUser() user: ActiveUserData,
    @Param('id') filingId: string,
    @Body() dto: TaxIdempotentDto,
  ) {
    return this.taxService.createPreparationSession(user.sub, filingId, dto);
  }

  @Post('filings/:id/documents')
  registerDocument(
    @ActiveUser() user: ActiveUserData,
    @Param('id') filingId: string,
    @Body() dto: RegisterTaxDocumentDto,
  ) {
    return this.taxService.registerDocument(user.sub, filingId, dto);
  }

  @Post('filings/:id/submit')
  submitFiling(
    @ActiveUser() user: ActiveUserData,
    @Param('id') filingId: string,
    @Body() dto: TaxIdempotentDto,
  ) {
    return this.taxService.submitFiling(user.sub, filingId, dto);
  }
}
