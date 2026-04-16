import { Controller, Get, Param, Query } from '@nestjs/common';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { TransactionService } from './transaction.service';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get('me')
  async getUsertransaction(
    @ActiveUser() user: ActiveUserData,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return this.transactionService.getUserTransaction(user.sub, pageOptionsDto);
  }

  @Get('me/statement')
  async getUserStatement(
    @ActiveUser() user: ActiveUserData,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return this.transactionService.getUserStatement(user.sub, pageOptionsDto);
  }

  @Get(':id/receipt')
  async getTransactionReceipt(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: string,
  ) {
    return this.transactionService.getUserTransactionReceipt(user.sub, id);
  }

  @Get(':id')
  async findOne(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.transactionService.getUserTransactionDetail(user.sub, id);
  }
}
