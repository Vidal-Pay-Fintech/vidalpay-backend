import { DataSourceOptions } from 'typeorm';
import { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

const truthyValues = ['1', 'true', 'yes', 'require', 'required', 'enabled'];

const parseBooleanEnv = (value?: string) =>
  value ? truthyValues.includes(value.trim().toLowerCase()) : false;

const parsePositiveIntegerEnv = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const sslOption = () =>
  parseBooleanEnv(process.env.DB_SSL)
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

const connectTimeout = () =>
  parsePositiveIntegerEnv(process.env.DB_CONNECT_TIMEOUT_MS);

export const buildDatabaseDataSourceOptions = (
  overrides: Partial<MysqlConnectionOptions | PostgresConnectionOptions> = {},
): DataSourceOptions => {
  const databaseUrl = process.env.DATABASE_URL;
  const timeout = connectTimeout();
  const ssl = sslOption();

  if (databaseUrl) {
    if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
      return {
        type: 'postgres',
        url: databaseUrl,
        ...(timeout
          ? { extra: { connectionTimeoutMillis: timeout } }
          : {}),
        ...(ssl ? { ssl } : {}),
        ...overrides,
      } as PostgresConnectionOptions;
    }

    if (!/^mysql2?:\/\//i.test(databaseUrl)) {
      throw new Error(
        'DATABASE_URL must be a PostgreSQL URL (postgresql://...) or a MySQL URL (mysql://...).',
      );
    }

    return {
      type: 'mysql',
      url: databaseUrl,
      ...(timeout ? { connectTimeout: timeout } : {}),
      ...(ssl ? { ssl } : {}),
      ...overrides,
    } as MysqlConnectionOptions;
  }

  const requiredEnv = [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_DATABASE',
    'MYSQL_USERNAME',
    'MYSQL_PASSWORD',
  ] as const;
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);

  if (missingEnv.length > 0) {
    throw new Error(
      `Cannot configure MySQL database. Set DATABASE_URL or provide missing environment variables: ${missingEnv.join(
        ', ',
      )}`,
    );
  }

  return {
    type: 'mysql',
    host: process.env.MYSQL_HOST as string,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DATABASE as string,
    username: process.env.MYSQL_USERNAME as string,
    password: process.env.MYSQL_PASSWORD as string,
    ...(timeout ? { connectTimeout: timeout } : {}),
    ...(ssl ? { ssl } : {}),
    ...overrides,
  } as MysqlConnectionOptions;
};

// Backwards-compatible export for code outside this module. The connection
// type is selected from DATABASE_URL when one is supplied.
export const buildMysqlDataSourceOptions = buildDatabaseDataSourceOptions;
