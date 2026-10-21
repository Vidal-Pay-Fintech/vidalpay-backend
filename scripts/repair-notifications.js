'use strict';

const { sslConfiguration } = require('./audit-legacy-data');

const REQUIRED_COLUMNS = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'userId',
  'title',
  'body',
  'category',
  'read',
  'metadata',
];

async function inspect(client) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notification'
  `);
  const columns = new Set(rows.map((row) => row.column_name));
  const exists = rows.length > 0;
  const missing = exists ? REQUIRED_COLUMNS.filter((name) => !columns.has(name)) : [];
  const { rows: indexes } = exists
    ? await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'notification'
      `)
    : { rows: [] };
  const indexNames = new Set(indexes.map((row) => row.indexname));

  return {
    exists,
    missing,
    missingIndexes: exists && !missing.length && !indexNames.has('IDX_notification_user_read')
      ? [['userId', 'read']]
      : [],
  };
}

async function repair(client, apply = false) {
  const plan = await inspect(client);
  if (!apply) {
    return { applied: false, ...plan };
  }

  if (plan.exists && plan.missing.length) {
    throw new Error(`Existing notification table is missing columns (${plan.missing.join(', ')}); manual review required.`);
  }

  if (plan.exists && !plan.missingIndexes.length) {
    return { applied: false, ...plan };
  }

  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.notification (
        id uuid PRIMARY KEY,
        "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" timestamp NULL,
        "userId" varchar NOT NULL,
        title varchar NOT NULL,
        body text NOT NULL,
        category varchar NOT NULL DEFAULT 'General',
        "read" boolean NOT NULL DEFAULT false,
        metadata text NULL
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_notification_user_read" ON public.notification ("userId", "read")');

    const verified = await inspect(client);
    if (!verified.exists || verified.missing.length || verified.missingIndexes.length) {
      throw new Error('Notification storage schema verification failed.');
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
  if (args.length > 1 || args.some((arg) => !['--check', '--apply'].includes(arg))) {
    throw new Error('Use --check (default) or --apply.');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString || '')) {
    throw new Error('A PostgreSQL DATABASE_URL is required. No connection was attempted.');
  }
  const { Client } = require('pg');
  const client = new Client({
    connectionString,
    ssl: sslConfiguration(process.env.DB_SSL),
    connectionTimeoutMillis: 10000,
  });
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
    process.stderr.write(`Notification storage repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Review database connectivity, privileges, and schema.' : error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { inspect, repair };
