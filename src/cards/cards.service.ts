import { Injectable } from '@nestjs/common';
import { KycProvider } from 'src/common/enum/kyc-provider.enum';
import { ProviderOperationStatus } from 'src/common/enum/provider-operation.enum';
import { CardStatus } from 'src/database/entities/card.entity';
import { CardTransactionType } from 'src/database/entities/card-transaction.entity';
import { CardFundingRepository } from 'src/database/repositories/card-funding.repository';
import { CardRepository } from 'src/database/repositories/card.repository';
import { CardSettingsRepository } from 'src/database/repositories/card-settings.repository';
import { CardTransactionRepository } from 'src/database/repositories/card-transaction.repository';
import { WalletRepository } from 'src/database/repositories/wallet.repository';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { FxService } from 'src/fx/fx.service';
import { NotificationService } from 'src/notifications/notification.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { TagType } from 'src/utils/enums/tag.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { FundCardDto } from './dto/fund-card.dto';

@Injectable()
export class CardsService {
  constructor(
    private readonly cardRepository: CardRepository,
    private readonly cardFundingRepository: CardFundingRepository,
    private readonly cardTransactionRepository: CardTransactionRepository,
    private readonly cardSettingsRepository: CardSettingsRepository,
    private readonly walletRepository: WalletRepository,
    private readonly transactionService: TransactionService,
    private readonly fxService: FxService,
    private readonly featureFlags: FeatureFlagService,
    private readonly notificationService: NotificationService,
  ) {}

  async getCards(userId: string) {
    this.featureFlags.assertDemoEnabled();
    this.featureFlags.assertEnabled('ENABLE_VIRTUAL_CARD_DEMO');
    await Promise.all([
      this.ensureCard(userId, Currency.NGN),
      this.ensureCard(userId, Currency.USD),
    ]);

    const cards = await this.cardRepository.findUserCards(userId);
    return Promise.all(cards.map((card) => this.serializeCard(card)));
  }

  fundNgn(userId: string, dto: FundCardDto) {
    return this.fundCardFromWallet(userId, Currency.NGN, Currency.NGN, dto);
  }

  fundUsd(userId: string, dto: FundCardDto) {
    return this.fundCardFromWallet(userId, Currency.USD, Currency.USD, dto);
  }

  async fundNgnFromUsd(userId: string, dto: FundCardDto) {
    const conversion = await this.fxService.convert(userId, {
      sourceCurrency: Currency.USD,
      targetCurrency: Currency.NGN,
      amount: dto.amount,
    });

    const funding = await this.fundCardFromWallet(
      userId,
      Currency.NGN,
      Currency.NGN,
      {
        amount: conversion.quote.destinationAmount,
        note:
          dto.note ?? `Fund NGN card from USD via ${conversion.quote.quoteId}`,
      },
      conversion.quote.quoteId,
    );

    return { conversion, funding };
  }

  async fundUsdFromNgn(userId: string, dto: FundCardDto) {
    const conversion = await this.fxService.convert(userId, {
      sourceCurrency: Currency.NGN,
      targetCurrency: Currency.USD,
      amount: dto.amount,
    });

    const funding = await this.fundCardFromWallet(
      userId,
      Currency.USD,
      Currency.USD,
      {
        amount: conversion.quote.destinationAmount,
        note:
          dto.note ?? `Fund USD card from NGN via ${conversion.quote.quoteId}`,
      },
      conversion.quote.quoteId,
    );

    return { conversion, funding };
  }

  private async fundCardFromWallet(
    userId: string,
    cardCurrency: Currency,
    sourceCurrency: Currency,
    dto: FundCardDto,
    fxQuoteId?: string | null,
  ) {
    this.featureFlags.assertDemoEnabled();
    this.featureFlags.assertEnabled('ENABLE_VIRTUAL_CARD_DEMO');
    const card = await this.ensureCard(userId, cardCurrency);
    const wallet = await this.walletRepository.findOne({
      where: { userId, currency: sourceCurrency },
    });

    if (!wallet) {
      throw new Error(`${sourceCurrency} wallet not found.`);
    }

    const reference = `card_fund_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const walletTransaction = await this.transactionService.debitTransaction({
      userId,
      amount: dto.amount,
      currency: sourceCurrency,
      info: `${cardCurrency} card funding`,
      description: dto.note ?? `${cardCurrency} virtual card funding`,
      reference,
      tag: TagType.WALLET,
    });

    const balanceBefore = Number(card.balance ?? 0);
    const balanceAfter = Number((balanceBefore + dto.amount).toFixed(2));
    await this.cardRepository.findOneAndUpdate(card.id, {
      balance: balanceAfter,
      availableBalance: balanceAfter,
      status: CardStatus.ACTIVE,
    });

    const cardTransaction = await this.cardTransactionRepository.create({
      userId,
      cardId: card.id,
      type: CardTransactionType.FUNDING,
      status: ProviderOperationStatus.COMPLETED,
      amount: dto.amount,
      currency: cardCurrency,
      balanceBefore,
      balanceAfter,
      reference,
      description: dto.note ?? `${cardCurrency} card funded from wallet`,
      metadata: {
        walletTransactionReference: walletTransaction.reference,
        fxQuoteId: fxQuoteId ?? null,
      },
    });

    const funding = await this.cardFundingRepository.create({
      userId,
      cardId: card.id,
      sourceWalletId: wallet.id,
      amount: dto.amount,
      sourceCurrency,
      cardCurrency,
      status: ProviderOperationStatus.COMPLETED,
      fxQuoteId: fxQuoteId ?? null,
      walletTransactionReference: walletTransaction.reference,
      cardTransactionReference: cardTransaction.reference,
      receiptReference: `rcpt_${reference}`,
      providerReference: `mock_card_${reference}`,
      metadata: {
        demo: true,
      },
    });

    await this.notificationService.create({
      userId,
      type: 'CARD_FUNDED',
      title: 'Card funded',
      body: `${cardCurrency} ${dto.amount} was added to your virtual card.`,
      metadata: {
        cardId: card.id,
        reference,
        fxQuoteId: fxQuoteId ?? null,
      },
    });

    return {
      status: 'COMPLETED',
      card: await this.serializeCard(
        (await this.cardRepository.findOne({ where: { id: card.id } })) ?? card,
      ),
      funding,
      walletTransaction,
      cardTransaction,
      receipt: {
        receiptId: `rcpt_${reference}`,
        reference,
        walletTransactionReference: walletTransaction.reference,
        cardTransactionReference: cardTransaction.reference,
        amount: dto.amount,
        currency: cardCurrency,
        sourceCurrency,
        fxQuoteId: fxQuoteId ?? null,
        createdAt: new Date().toISOString(),
      },
    };
  }

  private async ensureCard(userId: string, currency: Currency) {
    const existing = await this.cardRepository.findUserCardByCurrency(
      userId,
      currency,
    );
    if (existing) {
      return existing;
    }

    const card = await this.cardRepository.create({
      userId,
      currency,
      status: CardStatus.ACTIVE,
      balance: 0,
      availableBalance: 0,
      provider:
        currency === Currency.NGN
          ? KycProvider.FLUTTERWAVE
          : KycProvider.LEAD_BANK,
      providerReference: `mock_card_${currency.toLowerCase()}_${userId}`,
      lastFour: currency === Currency.NGN ? '4242' : '1881',
      brand: 'VISA',
      cardName: `${currency} Virtual Card`,
      metadata: {
        demo: true,
        maskedPan: `411111******${currency === Currency.NGN ? '4242' : '1881'}`,
      },
    });

    await this.cardSettingsRepository.create({
      userId,
      cardId: card.id,
      onlinePaymentsEnabled: true,
      atmWithdrawalsEnabled: false,
      internationalPaymentsEnabled: currency === Currency.USD,
      dailySpendLimit: currency === Currency.NGN ? 500000 : 1000,
      metadata: {
        demo: true,
      },
    });

    return card;
  }

  private async serializeCard(card: any) {
    const [settings, transactions] = await Promise.all([
      this.cardSettingsRepository.findByCard(card.id),
      this.cardTransactionRepository.findByCard(card.id),
    ]);

    return {
      id: card.id,
      ledgerType: `card_${String(card.currency).toLowerCase()}`,
      currency: card.currency,
      status: card.status,
      balance: Number(card.balance ?? 0),
      availableBalance: Number(card.availableBalance ?? card.balance ?? 0),
      providerReference: card.providerReference,
      provider: card.provider,
      lastFour: card.lastFour,
      brand: card.brand,
      cardName: card.cardName,
      settings,
      transactionHistory: transactions,
      metadata: card.metadata,
      updatedAt: card.updatedAt,
    };
  }
}
