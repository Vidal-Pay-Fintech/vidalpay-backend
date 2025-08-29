import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { query } from 'winston';
import { PageOptionsDto } from 'src/common/pagination/pageOptionsDto.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get('me')
  async getUsertransaction(
    @ActiveUser() user: ActiveUserData,
    @Query() pageOptionsDto: PageOptionsDto,
  ) {
    return await this.transactionService.getUserTransaction(
      user.sub,
      pageOptionsDto,
    );
  }
  @Post()
  create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionService.create(createTransactionDto);
  }

  @Get()
  findAll() {
    return this.transactionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transactionService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionService.update(+id, updateTransactionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactionService.remove(+id);
  }
}
