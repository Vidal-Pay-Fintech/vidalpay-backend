'use strict';

const { quoteIdentifier, sslConfiguration } = require('./audit-legacy-data');
const additions = ['GBP', 'CAD'];

async function inspectWalletCurrency(client) {
  const { rows } = await client.query(`
    SELECT t.oid::text AS type_oid, tn.nspname AS type_schema,
      t.typname AS type_name, t.typtype AS type_kind
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
    WHERE n.nspname = 'public' AND c.relname = 'wallet'
      AND c.relkind IN ('r', 'p') AND a.attname = 'currency' AND NOT a.attisdropped
  `);
  if (rows.length !== 1 || rows[0].type_kind !== 'e') {
    throw new Error('public.wallet.currency must exist and use an enum; no currency repair was applied.');
  }
  const type = rows[0];
  const { rows: labels } = await client.query(`
    SELECT enumlabel FROM pg_catalog.pg_enum
    WHERE enumtypid = $1::oid ORDER BY enumsortorder
  `, [type.type_oid]);
  const values = labels.map((row) => row.enumlabel);
  if (!['NGN', 'USD'].every((currency) => values.includes(currency))) {
    throw new Error('Wallet enum does not contain both NGN and USD; review the database target and currency mapping.');
  }
  const { rows: users } = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE a.atttypid = $1::oid AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY n.nspname, c.relname, a.attname
  `, [type.type_oid]);
  if (users.length !== 1 || users[0].schema_name !== 'public' ||
      users[0].table_name !== 'wallet' || users[0].column_name !== 'currency') {
    throw new Error('Wallet enum is shared with other table columns; review those dependencies before changing it.');
  }
  return {
    typeOid: type.type_oid,
    enumType: { schema: type.type_schema, name: type.type_name },
    values,
    missing: additions.filter((currency) => !values.includes(currency)),
  };
}

function report(plan, added = []) {
  return { applied: added.length > 0, enumType: plan.enumType, values: plan.values, missing: plan.missing, added };
}

async function repairWalletCurrencies(client, apply = false) {
  const initial = await inspectWalletCurrency(client);
  if (!apply || !initial.missing.length) return report(initial);
  const version = await client.query('SHOW server_version_num');
  if (!(Number(version.rows[0]?.server_version_num) >= 120000)) {
    throw new Error('This transactional enum repair requires PostgreSQL 12 or newer; no changes were applied.');
  }
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    // Keep the wallet column bound to the inspected type during the repair.
    await client.query('LOCK TABLE "public"."wallet" IN ACCESS SHARE MODE');
    const current = await inspectWalletCurrency(client);
    if (current.typeOid !== initial.typeOid) {
      throw new Error('Wallet currency type changed during inspection; rerun the read-only check.');
    }
    const qualifiedType = `${quoteIdentifier(current.enumType.schema)}.${quoteIdentifier(current.enumType.name)}`;
    for (const currency of current.missing) {
      // Labels come only from the fixed GBP/CAD allowlist above.
      await client.query(`ALTER TYPE ${qualifiedType} ADD VALUE IF NOT EXISTS '${currency}'`);
    }
    const verified = await inspectWalletCurrency(client);
    if (verified.missing.length) throw new Error('Wallet currency repair verification failed.');
    // PostgreSQL makes the new enum values usable only after this commit.
    await client.query('COMMIT');
    return report(verified, current.missing);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Connection failures need a fresh read-only check. */ }
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
  const client = new Client({ connectionString, ssl: sslConfiguration(process.env.DB_SSL), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const result = await repairWalletCurrencies(client, args.includes('--apply'));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.missing.length) {
      process.stdout.write('Confirm the target database and backup, then use --apply for only these missing wallet enum values. No wallets or provider accounts are created.\n');
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Wallet currency repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Check connectivity/privileges and run --check to confirm the current state before retrying.' : error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { inspectWalletCurrency, repairWalletCurrencies };
