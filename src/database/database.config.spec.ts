import {
  buildDatabaseDataSourceOptions,
} from './database.config';

describe('database configuration', () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('connects to the existing Render PostgreSQL URL without enabling schema changes', () => {
    process.env.DATABASE_URL =
      'postgresql://user:password@db.example.com:5432/vidalpay';
    process.env.DB_SSL = 'true';
    process.env.DB_CONNECT_TIMEOUT_MS = '10000';

    expect(buildDatabaseDataSourceOptions()).toMatchObject({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      extra: { connectionTimeoutMillis: 10000 },
    });
  });

  it('does not accept an unsupported database URL scheme', () => {
    process.env.DATABASE_URL =
      'mongodb://user:password@db.example.com:27017/vidalpay';

    expect(() => buildDatabaseDataSourceOptions()).toThrow(
      'DATABASE_URL must be a PostgreSQL URL',
    );
  });
});
