import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import {
  AdminDisputeTransitionDto,
  AdminRefundTransitionDto,
  RegisterChargebackDto,
} from './dto/dispute-request.dto';
import { DisputeService } from './dispute.service';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.CUSTOMER_SUPPORT, Role.SETTLEMENT)
@Controller('admin/disputes')
export class DisputeAdminController {
  constructor(private readonly service: DisputeService) {}

  @Get('queue')
  getQueue() {
    return this.service.getAdminQueue();
  }

  @Post('chargebacks')
  registerChargeback(
    @Body() dto: RegisterChargebackDto,
    @ActiveUser() actor: ActiveUserData,
  ) {
    return this.service.registerChargeback(dto, actor.sub);
  }

  @Post(':id/transition')
  transitionDispute(
    @Param('id') id: string,
    @Body() dto: AdminDisputeTransitionDto,
    @ActiveUser() actor: ActiveUserData,
  ) {
    return this.service.adminTransitionDispute(id, dto, actor.sub);
  }

  @Post('refunds/:id/transition')
  transitionRefund(
    @Param('id') id: string,
    @Body() dto: AdminRefundTransitionDto,
    @ActiveUser() actor: ActiveUserData,
  ) {
    return this.service.adminTransitionRefund(id, dto, actor.sub);
  }
}
