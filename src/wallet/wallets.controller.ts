import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { Currency } from 'src/utils/enums/wallet.enum';
import { DemoFundWalletDto } from './dto/demo-fund-wallet.dto';
import { WalletService } from './wallet.service';
import { DemoOnly } from 'src/feature-flags/demo-only.decorator';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getWallets(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getUserWallets(user.sub);
  }

  @Get('ngn')
  getNgnWallet(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getUserWalletByCurrency(user.sub, Currency.NGN);
  }

  @Get('usd')
  getUsdWallet(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getUserWalletByCurrency(user.sub, Currency.USD);
  }

  @Post('fund/demo')
  @DemoOnly()
  fundDemoWallet(
    @ActiveUser() user: ActiveUserData,
    @Body() demoFundWalletDto: DemoFundWalletDto,
  ) {
    return this.walletService.fundDemoWallet(user.sub, demoFundWalletDto);
  }
}
