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
import { ExternalTransferDto } from './dto/external-transfer.dto';
import { AirtimePurchaseDto } from './dto/airtime-purchase.dto';
import { DataPurchaseDto } from './dto/data-purchase.dto';
import { UtilityPaymentDto } from './dto/utility-payment.dto';
import { CreateCardTopUpIntentDto } from './dto/create-card-topup-intent.dto';
import { ValidateUtilityCustomerDto } from './dto/validate-utility-customer.dto';
import { ResolveExternalAccountDto } from './dto/resolve-external-account.dto';
import { Role } from 'src/common/enum/role.enum';
import { Roles } from 'src/iam/decorators/roles.decorator';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('internal-transfer')
  internalTransfer(
    @Body() internalTransferDTO: InternalTransferDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.createInternalTransfer(
      internalTransferDTO,
      user.sub,
    );
  }

  @Post('external-transfer')
  externalTransfer(
    @Body() externalTransferDto: ExternalTransferDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.externalTransfer(externalTransferDto, user.sub);
  }

  @Get('catalogs/banks')
  getExternalBankCatalog(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getExternalBankCatalog(user.sub);
  }

  @Post('external-transfer/resolve')
  resolveExternalTransferRecipient(
    @Body() resolveExternalAccountDto: ResolveExternalAccountDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.resolveExternalTransferRecipient(
      resolveExternalAccountDto,
      user.sub,
    );
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

  @Post('airtime')
  purchaseAirtime(
    @Body() airtimePurchaseDto: AirtimePurchaseDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.purchaseAirtime(airtimePurchaseDto, user.sub);
  }

  @Post('data')
  purchaseData(
    @Body() dataPurchaseDto: DataPurchaseDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.purchaseData(dataPurchaseDto, user.sub);
  }

  @Post('utilities')
  payUtility(
    @Body() utilityPaymentDto: UtilityPaymentDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.payUtility(utilityPaymentDto, user.sub);
  }

  @Post('top-up/card')
  createCardTopUpIntent(
    @Body() createCardTopUpIntentDto: CreateCardTopUpIntentDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.createCardTopUpIntent(
      createCardTopUpIntentDto,
      user.sub,
    );
  }

  @Get('top-up/card/:reference')
  getCardTopUpStatus(
    @Param('reference') reference: string,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.getCardTopUpStatus(reference, user.sub);
  }

  @Get('catalogs/airtime')
  getAirtimeCatalog(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getAirtimeCatalog(user.sub);
  }

  @Get('catalogs/data')
  getDataCatalog(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getDataCatalog(user.sub);
  }

  @Get('catalogs/utilities')
  getUtilitiesCatalog(@ActiveUser() user: ActiveUserData) {
    return this.walletService.getUtilitiesCatalog(user.sub);
  }

  @Post('utilities/validate')
  validateUtilityCustomer(
    @Body() validateUtilityCustomerDto: ValidateUtilityCustomerDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.walletService.validateUtilityCustomer(
      validateUtilityCustomerDto,
      user.sub,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
  findAll() {
    return this.walletService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
  findOne(@Param('id') id: string) {
    return this.walletService.findOne(+id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
  update(@Param('id') id: string, @Body() updateWalletDto: UpdateWalletDto) {
    return this.walletService.update(+id, updateWalletDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SETTLEMENT)
  remove(@Param('id') id: string) {
    return this.walletService.remove(+id);
  }
}
