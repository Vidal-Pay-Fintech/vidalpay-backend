import { Body, Controller, Get, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('overview')
  getOverview() {
    return this.supportService.getOverview();
  }

  @Get('faqs')
  getFaqs() {
    return this.supportService.getFaqs();
  }

  @Get('tickets')
  getTickets(@ActiveUser() user: ActiveUserData) {
    return this.supportService.getUserTickets(user.sub);
  }

  @Post('tickets')
  createTicket(
    @ActiveUser() user: ActiveUserData,
    @Body() createSupportTicketDto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(user.sub, createSupportTicketDto);
  }
}
