import 'dotenv/config';
import { DataSource } from 'typeorm';
import { InitialBaseSchema1743000000000 } from './migrations/1743000000000-InitialBaseSchema';
import { AddProfileKycSchema1743584400000 } from './migrations/1743584400000-AddProfileKycSchema';
import { ReconcileUserProfileKycColumns1743660000000 } from './migrations/1743660000000-ReconcileUserProfileKycColumns';
import { ReconcileWalletAndKycSchema1743663600000 } from './migrations/1743663600000-ReconcileWalletAndKycSchema';
import { AddProviderOperationsSchema1743912000000 } from './migrations/1743912000000-AddProviderOperationsSchema';
import { AddProviderWebhookIdempotencyIndex1744000000000 } from './migrations/1744000000000-AddProviderWebhookIdempotencyIndex';
import { AddSecuritySupportAndTopUpSchema1744070400000 } from './migrations/1744070400000-AddSecuritySupportAndTopUpSchema';
import { AddBeneficiaryParitySchema1744857600000 } from './migrations/1744857600000-AddBeneficiaryParitySchema';
import { AddDemoReadinessSchema1744944000000 } from './migrations/1744944000000-AddDemoReadinessSchema';
import { AddWebhookHardeningFields1745030400000 } from './migrations/1745030400000-AddWebhookHardeningFields';
import { AddRefreshSessions1745116800000 } from './migrations/1745116800000-AddRefreshSessions';
import { AddSignupRegionAndDefaultWallet1745203200000 } from './migrations/1745203200000-AddSignupRegionAndDefaultWallet';
import { AddCryptoProductFoundation1745289600000 } from './migrations/1745289600000-AddCryptoProductFoundation';
import { AddInvestmentProductFoundation1745376000000 } from './migrations/1745376000000-AddInvestmentProductFoundation';
import { AddTaxFilingFoundation1745462400000 } from './migrations/1745462400000-AddTaxFilingFoundation';
import { AddLoanProductFoundation1745548800000 } from './migrations/1745548800000-AddLoanProductFoundation';
import { AddDisputeAndRefundFoundation1745635200000 } from './migrations/1745635200000-AddDisputeAndRefundFoundation';
import { AddScheduledPaymentsFoundation1745721600000 } from './migrations/1745721600000-AddScheduledPaymentsFoundation';
import { AddSessionDeviceManagement1745808000000 } from './migrations/1745808000000-AddSessionDeviceManagement';
import { AddAdminUserActions1745894400000 } from './migrations/1745894400000-AddAdminUserActions';
import { AddPushNotificationDelivery1745980800000 } from './migrations/1745980800000-AddPushNotificationDelivery';

const requiredEnv = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_USERNAME',
  'MYSQL_PASSWORD',
] as const;

for (const envKey of requiredEnv) {
  if (!process.env[envKey]) {
    throw new Error(
      `Missing required database environment variable: ${envKey}`,
    );
  }
}

export default new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  username: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  synchronize: false,
  migrationsTableName: 'migrations',
  migrations: [
    InitialBaseSchema1743000000000,
    AddProfileKycSchema1743584400000,
    ReconcileUserProfileKycColumns1743660000000,
    ReconcileWalletAndKycSchema1743663600000,
    AddProviderOperationsSchema1743912000000,
    AddProviderWebhookIdempotencyIndex1744000000000,
    AddSecuritySupportAndTopUpSchema1744070400000,
    AddBeneficiaryParitySchema1744857600000,
    AddDemoReadinessSchema1744944000000,
    AddWebhookHardeningFields1745030400000,
    AddRefreshSessions1745116800000,
    AddSignupRegionAndDefaultWallet1745203200000,
    AddCryptoProductFoundation1745289600000,
    AddInvestmentProductFoundation1745376000000,
    AddTaxFilingFoundation1745462400000,
    AddLoanProductFoundation1745548800000,
    AddDisputeAndRefundFoundation1745635200000,
    AddScheduledPaymentsFoundation1745721600000,
    AddSessionDeviceManagement1745808000000,
    AddAdminUserActions1745894400000,
    AddPushNotificationDelivery1745980800000,
  ],
});
