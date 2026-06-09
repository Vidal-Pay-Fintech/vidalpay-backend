import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagService } from 'src/feature-flags/feature-flag.service';
import { NotificationService } from 'src/notifications/notification.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { TagType } from 'src/utils/enums/tag.enum';
import { Currency } from 'src/utils/enums/wallet.enum';
import { FxConvertDto } from './dto/fx-convert.dto';
import { FxQuoteDto } from './dto/fx-quote.dto';

export interface FxQuote {
  quoteId: string;
  provider: string;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  amount: number;
  rate: number;
  fee: number;
  destinationAmount: number;
  expiresAt: string;
  createdAt: string;
}

@Injectable()
export class FxService {
  private readonly quoteCache = new Map<string, FxQuote>();

  constructor(
    private readonly configService: ConfigService,
    private readonly featureFlags: FeatureFlagService,
    private readonly transactionService: TransactionService,
    private readonly notificationService: NotificationService,
  ) {}

  createQuote(dto: FxQuoteDto): FxQuote {
    this.featureFlags.assertDemoEnabled();
    this.featureFlags.assertEnabled('ENABLE_FX_CONVERSION_DEMO');
    this.assertSupportedPair(dto.sourceCurrency, dto.targetCurrency);

    const rate = this.getMockRate(dto.sourceCurrency, dto.targetCurrency);
    const fee = Number((dto.amount * 0.01).toFixed(2));
    const netSourceAmount = dto.amount - fee;
    const destinationAmount = Number((netSourceAmount * rate).toFixed(2));
    const quote: FxQuote = {
      quoteId: `fxq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      provider: this.getProviderName(),
      sourceCurrency: dto.sourceCurrency,
      targetCurrency: dto.targetCurrency,
      amount: dto.amount,
      rate,
      fee,
      destinationAmount,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    this.quoteCache.set(quote.quoteId, quote);
    return quote;
  }

  async convert(userId: string, dto: FxConvertDto) {
    this.featureFlags.assertDemoEnabled();
    this.featureFlags.assertEnabled('ENABLE_FX_CONVERSION_DEMO');
    const quote =
      dto.quoteId && this.quoteCache.has(dto.quoteId)
        ? (this.quoteCache.get(dto.quoteId) as FxQuote)
        : this.createQuote(dto);

    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('FX quote has expired.');
    }

    if (
      quote.sourceCurrency !== dto.sourceCurrency ||
      quote.targetCurrency !== dto.targetCurrency ||
      Number(quote.amount) !== Number(dto.amount)
    ) {
      throw new BadRequestException(
        'FX quote does not match conversion request.',
      );
    }

    let sourceTransaction: any;
    let destinationTransaction: any;

    try {
      sourceTransaction = await this.transactionService.debitTransaction({
        userId,
        amount: quote.amount,
        currency: quote.sourceCurrency,
        info: `FX conversion ${quote.sourceCurrency} to ${quote.targetCurrency}`,
        description: `FX quote ${quote.quoteId} debit`,
        reference: `fx_src_${quote.quoteId}`,
        tag: TagType.EXCHANGE,
      });

      destinationTransaction = await this.transactionService.creditTransaction({
        userId,
        amount: quote.destinationAmount,
        currency: quote.targetCurrency,
        info: `FX conversion ${quote.sourceCurrency} to ${quote.targetCurrency}`,
        description: `FX quote ${quote.quoteId} credit`,
        reference: `fx_dst_${quote.quoteId}`,
        tag: TagType.EXCHANGE,
      });
    } catch (error) {
      if (sourceTransaction && !destinationTransaction) {
        await this.transactionService.creditTransaction({
          userId,
          amount: quote.amount,
          currency: quote.sourceCurrency,
          info: `Reversal for FX quote ${quote.quoteId}`,
          description: `REV-fx-${quote.quoteId}`,
          reference: `REV-fx_src_${quote.quoteId}`,
          tag: TagType.EXCHANGE,
        });
      }

      throw error;
    }

    await this.notificationService.create({
      userId,
      type: 'FX_CONVERSION_COMPLETED',
      title: 'FX conversion completed',
      body: `${quote.sourceCurrency} ${quote.amount} was converted to ${quote.targetCurrency} ${quote.destinationAmount}.`,
      metadata: {
        quoteId: quote.quoteId,
        sourceTransactionReference: sourceTransaction.reference,
        destinationTransactionReference: destinationTransaction.reference,
      },
    });

    return {
      status: 'COMPLETED',
      quote,
      sourceTransaction,
      destinationTransaction,
      receipt: {
        receiptId: `rcpt_${quote.quoteId}`,
        quoteId: quote.quoteId,
        provider: quote.provider,
        rate: quote.rate,
        fee: quote.fee,
        source: {
          currency: quote.sourceCurrency,
          amount: quote.amount,
          transactionReference: sourceTransaction.reference,
        },
        destination: {
          currency: quote.targetCurrency,
          amount: quote.destinationAmount,
          transactionReference: destinationTransaction.reference,
        },
        createdAt: new Date().toISOString(),
      },
      audit: {
        event: 'FX_CONVERSION_COMPLETED',
        providerId: `mock_fx_${quote.quoteId}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private assertSupportedPair(source: Currency, target: Currency) {
    if (source === target) {
      throw new BadRequestException(
        'Source and target currencies must differ.',
      );
    }

    const supported =
      (source === Currency.NGN && target === Currency.USD) ||
      (source === Currency.USD && target === Currency.NGN);

    if (!supported) {
      throw new BadRequestException(
        'Only NGN/USD demo conversions are supported.',
      );
    }
  }

  private getMockRate(source: Currency, target: Currency) {
    const baseUsdToNgn = 1520;
    const spread = 20;

    if (source === Currency.USD && target === Currency.NGN) {
      return baseUsdToNgn - spread;
    }

    if (source === Currency.NGN && target === Currency.USD) {
      return Number((1 / (baseUsdToNgn + spread)).toFixed(6));
    }

    throw new ServiceUnavailableException('FX provider is unavailable.');
  }

  private getProviderName() {
    const mode =
      this.configService.get<string>('FX_PROVIDER_MODE') ??
      process.env.FX_PROVIDER_MODE ??
      'mock';
    return mode === 'verto' ? 'Verto' : 'Mock FX';
  }
}
