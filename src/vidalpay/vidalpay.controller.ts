import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Auth } from 'src/iam/authentication/decorators/auth.decorator';
import { AuthType } from 'src/iam/authentication/enums/auth-type.enum';
import { ActiveUser } from 'src/iam/decorators/active-user.decorator';
import { ActiveUserData } from 'src/iam/interfaces/active-user-data-interfaces';
import { Roles } from 'src/iam/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { VidalpayService } from './vidalpay.service';

type AnyRecord = Record<string, unknown>;

@Controller('providers')
export class ProvidersController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('status')
  status() {
    return this.vidalpayService.getProviderStatuses();
  }
}

@Controller('kyc')
export class KycController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post('start')
  start(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.startKyc(user.sub);
  }

  @Get('status')
  status(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getKycStatus(user.sub);
  }
}

@Auth(AuthType.Bearer)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get()
  list() {
    return this.vidalpayService.listKycReviews();
  }

  @Get(':userId')
  one(@Param('userId') userId: string) {
    return this.vidalpayService.getKycReview(userId);
  }

  @Post(':userId/approve')
  approve(
    @ActiveUser() admin: ActiveUserData,
    @Param('userId') userId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.reviewKyc(
      admin.sub,
      userId,
      'VERIFIED',
      typeof body.reason === 'string' ? body.reason : undefined,
    );
  }

  @Post(':userId/reject')
  reject(
    @ActiveUser() admin: ActiveUserData,
    @Param('userId') userId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.reviewKyc(
      admin.sub,
      userId,
      'REJECTED',
      typeof body.reason === 'string' ? body.reason : undefined,
    );
  }

  @Post(':userId/request-information')
  requestInformation(
    @ActiveUser() admin: ActiveUserData,
    @Param('userId') userId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.reviewKyc(
      admin.sub,
      userId,
      'IN_PROGRESS',
      typeof body.reason === 'string' ? body.reason : 'Additional KYC information is required.',
    );
  }
}

@Controller('transfers')
export class TransfersController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post('internal')
  internal(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.internalTransfer(user.sub, body);
  }
}

@Controller('beneficiary')
export class BeneficiaryController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('me')
  me(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getBeneficiaries(user.sub);
  }

  @Get('resolve')
  resolve(@Query('tagId') tagId: string) {
    return this.vidalpayService.resolveBeneficiary(tagId);
  }
}

@Controller('transaction')
export class TransactionController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('me')
  me(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getTransactions(user.sub);
  }

  @Get('me/statement')
  statement(@ActiveUser() user: ActiveUserData, @Query() query: AnyRecord) {
    return this.vidalpayService.getStatement(user.sub, query);
  }

  @Get(':id')
  one(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.vidalpayService.getTransaction(user.sub, id);
  }

  @Get(':id/receipt')
  receipt(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.vidalpayService.getTransactionReceipt(user.sub, id);
  }
}

@Controller('fx')
export class FxController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('quotes')
  quotes(@ActiveUser() user: ActiveUserData, @Query() query: AnyRecord) {
    return this.vidalpayService.getFxQuote(user.sub, query);
  }

  @Post('convert')
  convert(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.convertFx(user.sub, body);
  }
}

@Controller('cards')
export class CardsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get()
  list(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.listCards(user.sub);
  }

  @Post('virtual')
  virtual(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.createCard(user.sub, 'virtual', body);
  }

  @Post('physical')
  physical(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.createCard(user.sub, 'physical', body);
  }

  @Get(':cardId')
  one(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.getCard(user.sub, cardId);
  }

  @Get(':cardId/transactions')
  transactions(
    @ActiveUser() user: ActiveUserData,
    @Param('cardId') cardId: string,
  ) {
    return this.vidalpayService.getCardTransactions(user.sub, cardId);
  }

  @Post(':cardId/freeze')
  freeze(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.blockCardOperation(user.sub, cardId, 'freeze');
  }

  @Post(':cardId/unfreeze')
  unfreeze(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.blockCardOperation(user.sub, cardId, 'unfreeze');
  }

  @Post(':cardId/terminate')
  terminate(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.blockCardOperation(user.sub, cardId, 'terminate');
  }

  @Patch(':cardId/settings')
  settings(
    @ActiveUser() user: ActiveUserData,
    @Param('cardId') cardId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockCardOperation(
      user.sub,
      cardId,
      'settings',
      body,
    );
  }

  @Get(':cardId/limits')
  limits(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.getCardLimits(user.sub, cardId);
  }

  @Patch(':cardId/limits')
  updateLimits(
    @ActiveUser() user: ActiveUserData,
    @Param('cardId') cardId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockCardOperation(
      user.sub,
      cardId,
      'limits',
      body,
    );
  }

  @Post(':cardId/fund')
  fund(
    @ActiveUser() user: ActiveUserData,
    @Param('cardId') cardId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockCardOperation(user.sub, cardId, 'fund', body);
  }

  @Post(':cardId/withdraw')
  withdraw(
    @ActiveUser() user: ActiveUserData,
    @Param('cardId') cardId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockCardOperation(
      user.sub,
      cardId,
      'withdraw',
      body,
    );
  }

  @Post(':cardId/reveal')
  reveal(@ActiveUser() user: ActiveUserData, @Param('cardId') cardId: string) {
    return this.vidalpayService.blockCardOperation(user.sub, cardId, 'reveal');
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get()
  list(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.listNotifications(user.sub);
  }

  @Post('read')
  read(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.markNotificationsRead(
      user.sub,
      Array.isArray(body.notificationIds)
        ? (body.notificationIds as string[])
        : undefined,
    );
  }

  @Get('preferences')
  preferences(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.getNotificationPreferences(user.sub);
  }

  @Post('preferences')
  updatePreferences(
    @ActiveUser() user: ActiveUserData,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.updateNotificationPreferences(user.sub, body);
  }

  @Get('devices')
  devices(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.listNotificationDevices(user.sub);
  }

  @Post('devices')
  registerDevice(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.registerNotificationDevice(user.sub, body);
  }

  @Post('devices/:id/revoke')
  revokeDevice(@ActiveUser() user: ActiveUserData, @Param('id') id: string) {
    return this.vidalpayService.revokeNotificationDevice(user.sub, id);
  }
}

@Controller('support')
export class SupportController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('overview')
  overview() {
    return this.vidalpayService.supportOverview();
  }

  @Get('faqs')
  faqs() {
    return this.vidalpayService.supportFaqs();
  }

  @Get('tickets')
  tickets(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.listSupportTickets(user.sub);
  }

  @Post('tickets')
  create(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.createSupportTicket(user.sub, body);
  }
}

@Controller('disputes')
export class DisputesController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post()
  create(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.createDispute(user.sub, body);
  }
}

@Controller('legal')
export class LegalController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('overview')
  overview() {
    return this.vidalpayService.legalOverview();
  }

  @Get('documents/:slug')
  document(@Param('slug') slug: string) {
    return this.vidalpayService.legalDocument(slug);
  }
}

@Controller('crypto')
export class CryptoController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('overview')
  overview(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.cryptoOverview(user.sub);
  }

  @Get('assets')
  assets(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.cryptoAssets(user.sub);
  }

  @Post('deposit-address')
  deposit(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'crypto_deposit',
      'crypto_deposit',
      body,
    );
  }

  @Post('withdrawal-quote')
  withdrawalQuote(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'crypto_withdrawal_quote',
      'crypto_withdrawal',
      body,
    );
  }

  @Post('withdrawals')
  withdrawal(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'crypto_withdrawal',
      'crypto_withdrawal',
      body,
    );
  }
}

@Controller('investments')
export class InvestmentsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('overview')
  overview(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.investmentsOverview(user.sub);
  }

  @Get('portfolio')
  portfolio(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.investmentsPortfolio(user.sub);
  }

  @Get('products')
  products(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.investmentProducts(user.sub);
  }

  @Post('account')
  account(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockInvestmentOperation(
      user.sub,
      body,
      'investment_account',
    );
  }

  @Post('orders')
  orders(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockInvestmentOperation(
      user.sub,
      body,
      'investment_order',
    );
  }

  @Get('orders/:orderId')
  orderStatus(@ActiveUser() user: ActiveUserData, @Param('orderId') orderId: string) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'investment_order_status',
      'investments_orders',
      { orderId },
    );
  }
}

@Controller('loans')
export class LoansController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('overview')
  overview(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.loanOverview(user.sub);
  }

  @Get('eligibility')
  eligibility(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.loanUnavailable(user.sub, 'usd_loan_eligibility');
  }

  @Get('offers')
  offers(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.loanUnavailable(user.sub, 'usd_loans');
  }

  @Post('applications')
  application(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockLoanOperation(
      user.sub,
      body,
      'loan_application',
    );
  }

  @Get('history')
  history(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.loanOverview(user.sub);
  }

  @Get(':loanId')
  loan(@ActiveUser() user: ActiveUserData, @Param('loanId') loanId: string) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'loan_detail',
      'usd_loans',
      { loanId },
    );
  }

  @Post(':loanId/accept')
  accept(
    @ActiveUser() user: ActiveUserData,
    @Param('loanId') loanId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockLoanOperation(user.sub, { ...body, loanId }, 'loan_accept');
  }

  @Get(':loanId/repayment-schedule')
  repaymentSchedule(
    @ActiveUser() user: ActiveUserData,
    @Param('loanId') loanId: string,
  ) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'loan_repayment_schedule',
      'usd_loan_repayment',
      { loanId },
    );
  }

  @Post(':loanId/repay')
  repay(
    @ActiveUser() user: ActiveUserData,
    @Param('loanId') loanId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockLoanOperation(user.sub, { ...body, loanId }, 'loan_repay');
  }
}

@Controller('tax')
export class TaxController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('status')
  status(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.taxStatus(user.sub);
  }

  @Get('overview')
  overview(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.taxOverview(user.sub);
  }

  @Post('filings')
  file(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockTaxOperation(user.sub, body, 'tax_filing');
  }
}

@Controller('rewards')
export class RewardsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('dashboard')
  dashboard(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.rewardsDashboard(user.sub);
  }

  @Get('history')
  history(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.rewardsHistory(user.sub);
  }

  @Post('redeem')
  redeem(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.redeemRewards(user.sub, body);
  }
}

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('dashboard')
  dashboard(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.referralsDashboard(user.sub);
  }

  @Get('earnings')
  earnings(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.referralEarnings(user.sub);
  }

  @Post('invite')
  invite(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.trackReferralInvite(user.sub, body);
  }
}

@Controller('qr')
export class QrController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Get('resolve')
  resolve(@ActiveUser() user: ActiveUserData, @Query() query: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'qr_resolve',
      'qr_payments',
      query,
    );
  }

  @Post('payments')
  payment(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'qr_payment',
      'qr_payments',
      body,
    );
  }
}

@Controller('money-requests')
export class MoneyRequestsController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post()
  create(@ActiveUser() user: ActiveUserData, @Body() body: AnyRecord) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'money_request_create',
      'money_requests',
      body,
    );
  }

  @Get()
  history(@ActiveUser() user: ActiveUserData) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'money_request_history',
      'money_requests',
    );
  }

  @Post(':requestId/accept')
  accept(
    @ActiveUser() user: ActiveUserData,
    @Param('requestId') requestId: string,
    @Body() body: AnyRecord,
  ) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'money_request_accept',
      'money_requests',
      { ...body, requestId },
    );
  }

  @Post(':requestId/decline')
  decline(@ActiveUser() user: ActiveUserData, @Param('requestId') requestId: string) {
    return this.vidalpayService.blockGenericOperation(
      user.sub,
      'money_request_decline',
      'money_requests',
      { requestId },
    );
  }
}

@Auth(AuthType.None)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly vidalpayService: VidalpayService) {}

  @Post('kyc/metamap')
  kyc(
    @Body() body: AnyRecord,
    @Headers('x-metamap-signature') metamapSignature?: string,
    @Headers('x-webhook-signature') webhookSignature?: string,
  ) {
    return this.vidalpayService.handleKycWebhook(
      body,
      metamapSignature ?? webhookSignature,
    );
  }

  @Post('unit')
  unit(
    @Body() body: AnyRecord,
    @Headers('x-unit-signature') unitSignature?: string,
    @Headers('x-signature') signature?: string,
  ) {
    return this.vidalpayService.handleProviderWebhook(
      'Unit.co',
      body,
      unitSignature ?? signature,
    );
  }

  @Post('payvessel')
  payvessel(
    @Body() body: AnyRecord,
    @Headers('x-payvessel-signature') payVesselSignature?: string,
    @Headers('x-signature') signature?: string,
  ) {
    return this.vidalpayService.handleProviderWebhook(
      'PayVessel',
      body,
      payVesselSignature ?? signature,
    );
  }
}
