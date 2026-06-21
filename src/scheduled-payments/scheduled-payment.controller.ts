import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { CreatePaymentScheduleDto } from './dto/scheduled-payment.dto';
import { ScheduledPaymentService } from './scheduled-payment.service';

@Controller('payment-schedules')
export class ScheduledPaymentController {
  constructor(private readonly service: ScheduledPaymentService) {}

  @Get()
  list(@ActiveUser() user: ActiveUserData) {
    return this.service.list(user.sub);
  }

  @Post()
  create(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreatePaymentScheduleDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Get(':id')
  get(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.get(user.sub, id);
  }

  @Post(':id/pause')
  pause(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.pause(user.sub, id);
  }

  @Post(':id/resume')
  resume(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.resume(user.sub, id);
  }

  @Post(':id/cancel')
  cancel(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.service.cancel(user.sub, id);
  }
}
