import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AddProfileKycSchema1743584400000 } from './migrations/1743584400000-AddProfileKycSchema';
import { ReconcileUserProfileKycColumns1743660000000 } from './migrations/1743660000000-ReconcileUserProfileKycColumns';

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
  ],
});
