'use strict';

const { sslConfiguration } = require('./audit-legacy-data');

// Explicitly limited to nullable account/provider fields, never ledger amounts.
const walletColumns = {
  accountNumber: 'varchar',
  routingNumber: 'varchar',
  accountName: 'varchar',
  bankName: 'varchar',
  sortCode: 'varchar',
  address: 'text',
  provider: 'varchar',
  providerCustomerId: 'varchar',
  providerAccountId: 'varchar',
  providerVirtualAccountId: 'varchar',
  providerStatus: 'varchar',
  providerReference: 'varchar',
  metadata: 'text',
};
const coreColumns = [
  'id', 'createdAt', 'updatedAt', 'deletedAt', 'userId',
  'balance', 'withdrawalSuspended', 'currency',
];

async function inspectWalletColumns(client) {
  const { rows } = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet'
  `);
  if (!rows.length) throw new Error('public.wallet was not found; no repair was applied.');
  const existing = new Map(rows.map((row) => [row.column_name, row.data_type]));
  const missingCore = coreColumns.filter((name) => !existing.has(name));
  if (missingCore.length) {
    throw new Error(`Core wallet fields are missing (${missingCore.join(', ')}); a reviewed migration is required.`);
  }
  const writtenColumns = new Set([...coreColumns, ...Object.keys(walletColumns)]);
  const requiredUnmapped = rows.filter((row) =>
    !writtenColumns.has(row.column_name) && row.is_nullable === 'NO' &&
    row.column_default == null && row.is_identity !== 'YES' &&
    (!row.is_generated || row.is_generated === 'NEVER'),
  );
  if (requiredUnmapped.length) {
    throw new Error(`Wallet inserts also require unmapped fields without defaults (${requiredUnmapped.map((row) => row.column_name).join(', ')}); a reviewed migration is required.`);
  }
  if (existing.get('currency') === 'USER-DEFINED') {
    const result = await client.query(`
      SELECT e.enumlabel FROM pg_catalog.pg_enum e
      JOIN pg_catalog.pg_attribute a ON a.atttypid = e.enumtypid
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'wallet'
        AND a.attname = 'currency' AND NOT a.attisdropped
    `);
    const missingCurrencies = ['NGN', 'USD', 'GBP', 'CAD'].filter(
      (currency) => !result.rows.some((row) => row.enumlabel === currency),
    );
    if (missingCurrencies.length) {
      throw new Error(`Wallet currency type does not support ${missingCurrencies.join(', ')}; run npm run db:repair-wallet-currencies -- --check and review the separate currency migration first.`);
    }
  }
  for (const name of Object.keys(walletColumns)) {
    const type = existing.get(name);
    const compatible = ['character varying', 'text', 'character'];
    if (name === 'metadata') compatible.push('json', 'jsonb');
    if (type && !compatible.includes(type)) {
      throw new Error(`Unexpected type for wallet.${name}; manual schema review is required.`);
    }
  }
  return Object.keys(walletColumns).filter((name) => !existing.has(name));
}

async function repairWalletSchema(client, apply = false) {
  const missing = await inspectWalletColumns(client);
  if (!apply || !missing.length) return { applied: false, missing, added: [] };
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    for (const name of missing) {
      await client.query(`ALTER TABLE "public"."wallet" ADD COLUMN IF NOT EXISTS "${name}" ${walletColumns[name]} NULL`);
    }
    if ((await inspectWalletColumns(client)).length) {
      throw new Error('Wallet schema repair verification failed.');
    }
    await client.query('COMMIT');
    return { applied: true, missing: [], added: missing };
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
    const result = await repairWalletSchema(client, args.includes('--apply'));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.missing.length) {
      process.stdout.write('Review the database target and backup before running with --apply. This repair does not modify balances, activate accounts, or migrate existing providers.\n');
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Wallet schema repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Review database connectivity, privileges, and schema.' : error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { walletColumns, coreColumns, repairWalletSchema };
