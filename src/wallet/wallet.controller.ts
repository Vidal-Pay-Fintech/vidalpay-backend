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
  airtimeCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'airtime');
  }

  @Get('catalogs/data')
  dataCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'data');
  }

  @Get('catalogs/utilities')
  utilitiesCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'utilities');
  }

  @Get('catalogs/tv')
  tvCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'tv');
  }

  @Get('catalogs/betting')
  bettingCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'betting');
  }

  @Get('catalogs/epins')
  epinsCatalog(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getCatalog(user.sub, 'epins');
  }

  @Post('utilities/validate')
  validateUtility(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.validateUtilityCustomer(user.sub, body);
  }

  @Post('services/verify')
  verifyServiceCustomer(
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

  @Post('electricity')
  electricity(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.purchaseService(user.sub, 'electricity', body);
  }

  @Post('tv')
  tv(@ActiveUser() user: ActiveUserData, @Body() body: Record<string, unknown>) {
    return this.vidalpayService.purchaseService(user.sub, 'tv', body);
  }

  @Post('betting')
  betting(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.purchaseService(user.sub, 'betting', body);
  }

  @Post('epins')
  epins(
    @ActiveUser() user: ActiveUserData,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.purchaseService(user.sub, 'epins', body);
  }
}

@Controller('wallets')
export class WalletsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get()
  wallets(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getWallets(user.sub);
  }

  @Get('available')
  available(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getAvailableWalletProducts(user.sub);
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

  @Get(':currency')
  walletByCurrency(
    @ActiveUser() user: ActiveUserData,
    @Param('currency') currency: string,
  ) {
    return this.vidalpayService.getWalletByCurrency(user.sub, currency);
  }

  @Get(':currency/account-details')
  accountDetailsByCurrency(
    @ActiveUser() user: ActiveUserData,
    @Param('currency') currency: string,
  ) {
    return this.vidalpayService.getWalletAccountDetails(user.sub, currency);
  }

  @Get(':currency/transactions')
  transactionsByCurrency(
    @ActiveUser() user: ActiveUserData,
    @Param('currency') currency: string,
  ) {
    return this.vidalpayService.getTransactions(user.sub, currency);
  }

  @Get(':currency/eligibility')
  eligibility(
    @ActiveUser() user: ActiveUserData,
    @Param('currency') currency: string,
  ) {
    return this.vidalpayService.getWalletEligibility(user.sub, currency);
  }

  @Post(':currency/activate')
  activate(
    @ActiveUser() user: ActiveUserData,
    @Param('currency') currency: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.vidalpayService.activateWalletProduct(
      user.sub,
      currency,
      body,
    );
  }
}
