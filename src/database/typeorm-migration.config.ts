import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AddProfileKycSchema1743584400000 } from './migrations/1743584400000-AddProfileKycSchema';
import { ReconcileUserProfileKycColumns1743660000000 } from './migrations/1743660000000-ReconcileUserProfileKycColumns';
import { ReconcileWalletAndKycSchema1743663600000 } from './migrations/1743663600000-ReconcileWalletAndKycSchema';
import { AddProviderOperationsSchema1743912000000 } from './migrations/1743912000000-AddProviderOperationsSchema';
import { AddProviderWebhookIdempotencyIndex1744000000000 } from './migrations/1744000000000-AddProviderWebhookIdempotencyIndex';
import { AddSecuritySupportAndTopUpSchema1744070400000 } from './migrations/1744070400000-AddSecuritySupportAndTopUpSchema';
import { AddBeneficiaryParitySchema1744857600000 } from './migrations/1744857600000-AddBeneficiaryParitySchema';
import { AddDemoReadinessSchema1744944000000 } from './migrations/1744944000000-AddDemoReadinessSchema';

const requiredEnv = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_USERNAME',
  'MYSQL_PASSWORD',
] as const;

for (const envKey of requiredEnv) {
  if (!process.env[envKey]) {
    throw new Error(`Missing required database environment variable: ${envKey}`);
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
    AddProfileKycSchema1743584400000,
    ReconcileUserProfileKycColumns1743660000000,
    ReconcileWalletAndKycSchema1743663600000,
    AddProviderOperationsSchema1743912000000,
    AddProviderWebhookIdempotencyIndex1744000000000,
    AddSecuritySupportAndTopUpSchema1744070400000,
    AddBeneficiaryParitySchema1744857600000,
    AddDemoReadinessSchema1744944000000,
  ],
});
