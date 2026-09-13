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
  it('builds all configured entity metadata without connecting or changing the schema', async () => {
    const dataSource = new DataSource({
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

    await expect((dataSource as any).buildMetadatas()).resolves.toBeUndefined();
  });
});
