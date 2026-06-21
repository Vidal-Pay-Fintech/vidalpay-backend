import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import {
  CreateDisputeDto,
  CreateRefundRequestDto,
  RegisterDisputeEvidenceDto,
} from './dto/dispute-request.dto';
import { DisputeService } from './dispute.service';

@Controller('disputes')
export class DisputeController {
  constructor(private readonly service: DisputeService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.service.getOverview(user.sub);
  }

  @Get()
  listDisputes(@ActiveUser() user: ActiveUserData) {
    return this.service.listDisputes(user.sub);
  }

  @Post()
  createDispute(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.service.createDispute(user.sub, dto);
  }

  @Get(':id')
  getDispute(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.getDispute(user.sub, id);
  }

  @Post(':id/evidence')
  registerEvidence(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: string,
    @Body() dto: RegisterDisputeEvidenceDto,
  ) {
    return this.service.registerEvidence(user.sub, id, dto);
  }

  @Post(':id/withdraw')
  withdrawDispute(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.withdrawDispute(user.sub, id);
  }
}

@Controller('refunds')
export class RefundController {
  constructor(private readonly service: DisputeService) {}

  @Get()
  listRefunds(@ActiveUser() user: ActiveUserData) {
    return this.service.listRefunds(user.sub);
  }

  @Post()
  createRefund(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateRefundRequestDto,
  ) {
    return this.service.createRefund(user.sub, dto);
  }

  @Get(':id')
  getRefund(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.getRefund(user.sub, id);
  }

  @Post(':id/cancel')
  cancelRefund(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.cancelRefund(user.sub, id);
  }
}
