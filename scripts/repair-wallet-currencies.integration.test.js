'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { repairWalletCurrencies } = require('./repair-wallet-currencies');
const { repairWalletSchema } = require('./repair-wallet-schema');

const connectionString = process.env.VIDALPAY_CURRENCY_TEST_URL;

test('currency and nullable-column repairs work together on an isolated PostgreSQL database', {
  skip: !connectionString,
}, async () => {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Integration tests require loopback PostgreSQL');
  assert.match(target.pathname, /^\/vidalpay_repair_test_[a-z0-9_]+$/, 'Use a dedicated disposable database');
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(tables.rows.length, 0, 'Refusing to test against an existing application database');
    await client.query(`CREATE TYPE "public"."wallet_currency_enum" AS ENUM ('NGN', 'USD')`);
    await client.query(`CREATE TABLE "public"."wallet" (
      "id" integer PRIMARY KEY, "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP, "deletedAt" timestamp,
      "userId" varchar NOT NULL, "balance" numeric NOT NULL DEFAULT 0,
      "availableBalance" numeric NOT NULL DEFAULT 0,
      "withdrawalSuspended" boolean NOT NULL DEFAULT false,
      "currency" "public"."wallet_currency_enum" NOT NULL
    )`);
    await client.query(`INSERT INTO "public"."wallet" (id, "userId", balance, currency)
      VALUES (1, 'test-user', 1234.56, 'NGN'), (2, 'test-user', 78.90, 'USD')`);
    const snapshot = await client.query('SELECT id, "userId", balance, "availableBalance", currency::text FROM public.wallet ORDER BY id');
    assert.deepEqual((await repairWalletCurrencies(client)).missing, ['GBP', 'CAD']);
    await assert.rejects(repairWalletSchema(client, true), /does not support GBP, CAD/);

    const failingClient = { query: async (sql, parameters) => {
      if (sql.startsWith('ALTER TYPE') && sql.endsWith("'CAD'")) throw new Error('injected second-step failure');
      return client.query(sql, parameters);
    } };
    await assert.rejects(repairWalletCurrencies(failingClient, true), /second-step failure/);
    assert.deepEqual((await repairWalletCurrencies(client)).values, ['NGN', 'USD']);

    assert.deepEqual((await repairWalletCurrencies(client, true)).added, ['GBP', 'CAD']);
    assert.deepEqual((await repairWalletCurrencies(client)).missing, []);
    assert.equal((await repairWalletCurrencies(client, true)).applied, false);
    assert.equal((await repairWalletSchema(client, true)).applied, true);
    assert.deepEqual((await repairWalletSchema(client)).missing, []);
    assert.equal((await repairWalletSchema(client, true)).applied, false);
    assert.deepEqual((await client.query('SELECT id, "userId", balance, "availableBalance", currency::text FROM public.wallet ORDER BY id')).rows, snapshot.rows);

    // Proves the committed enum values are accepted; these are test-only rows.
    await client.query(`INSERT INTO public.wallet (id, "userId", currency) VALUES (3, 'test-user', 'GBP'), (4, 'test-user', 'CAD')`);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM public.wallet')).rows[0].count, 4);
  } finally {
    await client.end();
  }
});
