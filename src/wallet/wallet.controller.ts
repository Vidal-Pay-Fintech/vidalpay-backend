import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { Currency } from 'src/utils/enums/wallet.enum';
import { VidalpayService } from 'src/vidalpay/vidalpay.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post('external-transfer')
  externalTransfer(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.externalTransfer(user.sub, body);
  }

  @Post('external-transfer/resolve')
  resolveExternalTransfer(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.resolveExternalTransfer(user.sub, body);
  }

  @Get('transactions')
  transactions(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getTransactions(user.sub);
  }

  @Get('catalogs/banks')
  banks() {
    return this.vidalpayService.getBankCatalog();
  }

  @Post('top-up/card')
  topUpCard(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.createCardTopUpIntent(user.sub, body);
  }

  @Get('top-up/card/:reference')
  topUpCardStatus(
    @ActiveUser() user: ActiveUserData,
    @Param('reference') reference: string,
  ) {
    return this.vidalpayService.getCardTopUpStatus(user.sub, reference);
  }

  @Get('catalogs/airtime')
  airtimeCatalog() {
    return this.vidalpayService.getCatalog('airtime');
  }

  @Get('catalogs/data')
  dataCatalog() {
    return this.vidalpayService.getCatalog('data');
  }

  @Get('catalogs/utilities')
  utilitiesCatalog() {
    return this.vidalpayService.getCatalog('utilities');
  }

  @Post('utilities/validate')
  validateUtility(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.validateUtilityCustomer(user.sub, body);
  }

  @Post('airtime')
  airtime(@ActiveUser() user: ActiveUserData, @Body() body: Record<string, unknown>) {
    return this.vidalpayService.purchaseService(user.sub, 'airtime', body);
  }

  @Post('data')
  data(@ActiveUser() user: ActiveUserData, @Body() body: Record<string, unknown>) {
    return this.vidalpayService.purchaseService(user.sub, 'data', body);
  }

  @Post('utilities')
  utilities(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.purchaseService(user.sub, 'utilities', body);
  }
}

@Controller('wallets')
export class WalletsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get()
  wallets(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWallets(user.sub);
  }

  @Get('ngn')
  ngn(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWalletByCurrency(user.sub, Currency.NGN);
  }

  @Get('usd')
  usd(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWalletByCurrency(user.sub, Currency.USD);
  }

  @Get('ngn/account-details')
  ngnAccountDetails(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWalletAccountDetails(user.sub, Currency.NGN);
  }

  @Get('usd/account-details')
  usdAccountDetails(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWalletAccountDetails(user.sub, Currency.USD);
  }

  @Get('transactions')
  transactions(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getTransactions(user.sub);
  }

  @Get('ngn/transactions')
  ngnTransactions(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getTransactions(user.sub, Currency.NGN);
  }

  @Get('usd/transactions')
  usdTransactions(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getTransactions(user.sub, Currency.USD);
  }
}
