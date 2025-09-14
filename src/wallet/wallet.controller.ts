import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { InternalTransferDto } from './dto/internal-transafer.dto';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { ExchangeDto } from './dto/exchange.dto';
import { ExchangeRangeDto } from './dto/exchange.rate.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('internal-transfer')
  internalTransfer(
    @Body() internalTransferDTO: InternalTransferDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.internalTransfer(internalTransferDTO, user.sub);
  }

  @Post('internal-exchange')
  internalExchange(
    @Body() internalExchangeDTO: ExchangeDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.internalExchange(internalExchangeDTO, user.sub);
  }

  @Post('exchange-rate')
  myExchangeRate(
    @Body() exchangeRateDTO: ExchangeRangeDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    const { fromCurrency, toCurrency } = exchangeRateDTO;
    return this.walletService.getExchangeRate(fromCurrency, toCurrency);
  }

  @Get()
  findAll() {
    return this.walletService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.walletService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWalletDto: UpdateWalletDto) {
    return this.walletService.update(+id, updateWalletDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.walletService.remove(+id);
  }
}
