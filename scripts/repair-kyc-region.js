'use strict';

const { sslConfiguration } = require('./audit-legacy-data');
const columns = ['countryCode', 'residency', 'region'];

async function inspectColumns(client) {
  const { rows } = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user'
  `);
  if (!rows.length) throw new Error('public.user was not found; no repair was applied.');
  for (const column of rows.filter((row) => columns.includes(row.column_name))) {
    if (!['character varying', 'text', 'character'].includes(column.data_type)) {
      throw new Error(`Unexpected type for ${column.column_name}; manual schema review is required.`);
    }
  }
  return columns.filter((name) => !rows.some((row) => row.column_name === name));
}

async function repairKycRegion(client, apply = false) {
  const missing = await inspectColumns(client);
  if (!apply || !missing.length) return { applied: false, missing, added: [] };

  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    // Only add nullable fields. Never infer residence or overwrite customer data.
    for (const name of missing) {
      await client.query(`ALTER TABLE "public"."user" ADD COLUMN IF NOT EXISTS "${name}" varchar NULL`);
    }
    const remaining = await inspectColumns(client);
    if (remaining.length) throw new Error('Schema repair verification failed.');
    await client.query('COMMIT');
    return { applied: true, missing: [], added: missing };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--check', '--apply'].includes(arg)) || args.length > 1) {
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
    const result = await repairKycRegion(client, args.includes('--apply'));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.missing.length) {
      process.stdout.write('Missing fields can break login/signup. Review the target database, then run with --apply.\n');
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Do not print connection strings, query parameters, or customer records.
    process.stderr.write(`KYC region repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Review database connectivity, privileges, and schema.' : error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { repairKycRegion };
