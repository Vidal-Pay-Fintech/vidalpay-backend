jest.mock('pg', () => ({}), { virtual: true });

import { DataSource } from 'typeorm';
import { AuthSession } from './entities/auth-session.entity';
import { Beneficiary } from './entities/beneficiary.entity';
import { Card } from './entities/card.entity';
import { Dispute } from './entities/dispute.entity';
import { FinancialTransaction } from './entities/financial-transaction.entity';
import { KycProfile } from './entities/kyc-profile.entity';
import { NotificationDevice } from './entities/notification-device.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { Notification } from './entities/notification.entity';
import { ProviderOperation } from './entities/provider-operation.entity';
import { ReferralEvent } from './entities/referral-event.entity';
import { RewardLedgerEntry } from './entities/reward-ledger-entry.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { Token } from './entities/token.entity';
import { User } from './entities/user.entity';
import { Wallet } from './entities/wallet.entity';

describe('PostgreSQL entity metadata', () => {
  const buildMetadataDataSource = () =>
    new DataSource({
      type: 'postgres',
      url: 'postgresql://test:test@localhost:5432/vidalpay',
      entities: [
        User,
        Token,
        Wallet,
        AuthSession,
        Beneficiary,
        Card,
        Dispute,
        FinancialTransaction,
        KycProfile,
        Notification,
        NotificationDevice,
        NotificationPreference,
        ProviderOperation,
        ReferralEvent,
        RewardLedgerEntry,
        SupportTicket,
      ],
      synchronize: false,
      migrationsRun: false,
    });

  it('builds all configured entity metadata without connecting or changing the schema', async () => {
    const dataSource = buildMetadataDataSource();

    await expect((dataSource as any).buildMetadatas()).resolves.toBeUndefined();
  });

  it('keeps migration-era fields out of default reads and writes for the existing production schema', async () => {
    const dataSource = buildMetadataDataSource();

    await (dataSource as any).buildMetadatas();

    const optionalUserColumns = [
      'countryCode',
      'residency',
      'region',
      'pendingEmail',
      'pendingPhoneNumber',
      'kycStatus',
      'capabilities',
      'productAvailability',
      'limits',
    ];
    const optionalWalletColumns = [
      'availableBalance',
      'ledgerBalance',
      'address',
      'provider',
      'providerCustomerId',
      'providerAccountId',
      'providerVirtualAccountId',
      'providerStatus',
      'providerReference',
      'metadata',
    ];

    const userMetadata = dataSource.getMetadata(User);
    const walletMetadata = dataSource.getMetadata(Wallet);

    for (const propertyName of optionalUserColumns) {
      const column = userMetadata.findColumnWithPropertyName(propertyName);
      expect(column).toEqual(
        expect.objectContaining({
          isSelect: false,
          isInsert: false,
          isUpdate: false,
        }),
      );
    }

    for (const propertyName of optionalWalletColumns) {
      const column = walletMetadata.findColumnWithPropertyName(propertyName);
      expect(column).toEqual(
        expect.objectContaining({
          isSelect: false,
          isInsert: false,
          isUpdate: false,
        }),
      );
    }
  });
});
