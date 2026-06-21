import { Body, Controller, Get, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateInvestmentOrderDto,
  InvestmentFundingDto,
} from './dto/investment-request.dto';
import { InvestmentService } from './investment.service';

@Controller('investments')
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.getOverview(user.sub);
  }

  @Get('account')
  getAccount(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.getAccount(user.sub);
  }

  @Post('account')
  openAccount(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.openAccount(user.sub);
  }

  @Get('products')
  getProducts() {
    return this.investmentService.getProducts();
  }

  @Post('products/sync')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
  syncProducts() {
    return this.investmentService.syncProducts();
  }

  @Get('portfolio')
  getPortfolio(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.getPortfolio(user.sub);
  }

  @Get('orders')
  listOrders(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.listOrders(user.sub);
  }

  @Post('orders')
  createOrder(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateInvestmentOrderDto,
  ) {
    return this.investmentService.createOrder(user.sub, dto);
  }

  @Get('funding')
  listFunding(@ActiveUser() user: ActiveUserData) {
    return this.investmentService.listFunding(user.sub);
  }

  @Post('deposits')
  deposit(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: InvestmentFundingDto,
  ) {
    return this.investmentService.deposit(user.sub, dto);
  }

  @Post('withdrawals')
  withdraw(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: InvestmentFundingDto,
  ) {
    return this.investmentService.withdraw(user.sub, dto);
  }
}
