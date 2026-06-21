import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { CryptoService } from './crypto.service';
import {
  CreateCryptoOrderDto,
  CreateCryptoStakeDto,
  CryptoDepositAddressDto,
  CryptoIdempotentDto,
  CryptoWithdrawalDto,
} from './dto/crypto-request.dto';

@Controller('crypto')
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Get('overview')
  getOverview(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.getOverview(user.sub);
  }

  @Get('assets')
  getAssets() {
    return this.cryptoService.getAssets();
  }

  @Get('account')
  getAccount(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.getAccount(user.sub);
  }

  @Post('account')
  openAccount(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.openAccount(user.sub);
  }

  @Get('portfolio')
  getPortfolio(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.getPortfolio(user.sub);
  }

  @Get('orders')
  listOrders(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.listOrders(user.sub);
  }

  @Post('orders')
  createOrder(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CreateCryptoOrderDto,
  ) {
    return this.cryptoService.createOrder(user.sub, dto);
  }

  @Post('orders/:id/cancel')
  cancelOrder(
    @ActiveUser() user: ActiveUserData,
    @Param('id') orderId: string,
    @Body() dto: CryptoIdempotentDto,
  ) {
    return this.cryptoService.cancelOrder(
      user.sub,
      orderId,
      dto.idempotencyKey,
    );
  }

  @Get('deposit-addresses')
  listDepositAddresses(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.listDepositAddresses(user.sub);
  }

  @Post('deposit-addresses')
  createDepositAddress(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CryptoDepositAddressDto,
  ) {
    return this.cryptoService.createDepositAddress(user.sub, dto);
  }

  @Get('transfers')
  listTransfers(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.listTransfers(user.sub);
  }

  @Post('withdrawals')
  withdraw(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: CryptoWithdrawalDto,
  ) {
    return this.cryptoService.withdraw(user.sub, dto);
  }

  @Get('staking')
  listStakingPositions(@ActiveUser() user: ActiveUserData) {
    return this.cryptoService.listStakingPositions(user.sub);
  }

  @Post('staking')
  stake(@ActiveUser() user: ActiveUserData, @Body() dto: CreateCryptoStakeDto) {
    return this.cryptoService.stake(user.sub, dto);
  }

  @Post('staking/:id/unstake')
  unstake(
    @ActiveUser() user: ActiveUserData,
    @Param('id') positionId: string,
    @Body() dto: CryptoIdempotentDto,
  ) {
    return this.cryptoService.unstake(user.sub, positionId, dto.idempotencyKey);
  }
}
