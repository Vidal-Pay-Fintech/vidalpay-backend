'use strict';

const { sslConfiguration } = require('./audit-legacy-data');

async function inspect(client) {
  const { rows } = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'support_message'
  `);
  const required = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'ticketId', 'userId', 'authorType', 'authorId', 'message'];
  const columns = new Set(rows.map((row) => row.column_name));
  const missing = required.filter((name) => !columns.has(name));
  const { rows: indexes } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'support_message'
  `);
  return {
    exists: rows.length > 0,
    missing,
    missingIndexes: [
      ...(!indexes.some((row) => row.indexname === 'IDX_support_message_ticket_created') ? [['ticketId', 'createdAt']] : []),
      ...(!indexes.some((row) => row.indexname === 'IDX_support_message_user') ? [['userId']] : []),
    ],
  };
}

async function repair(client, apply = false) {
  const plan = await inspect(client);
  if (!apply || (plan.exists && !plan.missing.length && !plan.missingIndexes.length)) {
    return { applied: false, ...plan };
  }
  if (plan.exists && plan.missing.length) {
    throw new Error(`Existing support_message table has unexpected missing columns (${plan.missing.join(', ')}); manual review required.`);
  }
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.support_message (
        id varchar(36) PRIMARY KEY,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" timestamp NULL,
        "ticketId" varchar(36) NOT NULL,
        "userId" varchar(36) NOT NULL,
        "authorType" varchar(24) NOT NULL DEFAULT 'CUSTOMER',
        "authorId" varchar(36) NOT NULL,
        message text NOT NULL
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_support_message_ticket_created" ON public.support_message ("ticketId", "createdAt")');
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_support_message_user" ON public.support_message ("userId")');
    const verified = await inspect(client);
    if (!verified.exists || verified.missing.length || verified.missingIndexes.length) {
      throw new Error('Support messaging schema verification failed.');
    }
    await client.query('COMMIT');
    return { applied: true, ...verified };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--check', '--apply'].includes(arg))) throw new Error('Use --check (default) or --apply.');
  const connectionString = process.env.DATABASE_URL;
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString || '')) throw new Error('A PostgreSQL DATABASE_URL is required. No connection was attempted.');
  const { Client } = require('pg');
  const client = new Client({ connectionString, ssl: sslConfiguration(process.env.DB_SSL), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const result = await repair(client, args.includes('--apply'));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.exists || result.missing.length || result.missingIndexes.length) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Support messaging schema repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Review database connectivity, privileges, and schema.' : error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { inspect, repair };
