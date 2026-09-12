import { MysqlConnectionOptions } from 'typeorm/driver/mysql/MysqlConnectionOptions';

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

const assertMysqlDatabaseUrl = (databaseUrl: string) => {
  if (!/^mysql2?:\/\//i.test(databaseUrl)) {
    throw new Error(
      [
        'DATABASE_URL is configured, but this backend is currently configured for MySQL.',
        'Use a MySQL connection URL such as mysql://user:password@host:3306/database.',
        'PostgreSQL URLs from Render Postgres are not compatible with the current TypeORM entities and migrations.',
      ].join(' '),
    );
  }
};

const sslOption = () =>
  parseBooleanEnv(process.env.DB_SSL)
    ? {
        rejectUnauthorized: false,
      }
    : undefined;

const connectTimeout = () =>
  parsePositiveIntegerEnv(process.env.DB_CONNECT_TIMEOUT_MS);

export const buildMysqlDataSourceOptions = (
  overrides: Partial<MysqlConnectionOptions> = {},
): MysqlConnectionOptions => {
  const databaseUrl = process.env.DATABASE_URL;
  const timeout = connectTimeout();
  const ssl = sslOption();
  const sharedOptions: Partial<MysqlConnectionOptions> = {
    ...(timeout ? { connectTimeout: timeout } : {}),
    ...(ssl ? { ssl } : {}),
  };

  if (databaseUrl) {
    assertMysqlDatabaseUrl(databaseUrl);
    return {
      type: 'mysql',
      url: databaseUrl,
      ...sharedOptions,
      ...overrides,
    };
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
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DATABASE,
    username: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    ...sharedOptions,
    ...overrides,
  };
};
