import { Controller, Post } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { ScheduledPaymentService } from './scheduled-payment.service';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
@Controller('admin/payment-schedules')
export class ScheduledPaymentAdminController {
  constructor(private readonly service: ScheduledPaymentService) {}

  @Post('process-due')
  processDue() {
    return this.service.processDue();
  }
}
