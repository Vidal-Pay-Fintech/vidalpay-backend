'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { walletColumns, coreColumns, repairWalletSchema } = require('./repair-wallet-schema');

function fixture({ missing = ['address'], missingCore = [], types = {}, extra = [], currencies, failOn, ignoreAlter = false, absent = false } = {}) {
  let columns = new Map(absent ? [] : [
    ...coreColumns.filter((name) => !missingCore.includes(name)).map((name) => [name, 'text']),
    ...Object.entries(walletColumns).filter(([name]) => !missing.includes(name))
      .map(([name, type]) => [name, types[name] || (type === 'varchar' ? 'character varying' : type)]),
  ]);
  let before;
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('information_schema.columns')) {
        return { rows: [
          ...[...columns].map(([column_name, data_type]) => ({ column_name, data_type: column_name === 'currency' && currencies ? 'USER-DEFINED' : data_type })),
          ...extra,
        ] };
      }
      if (sql.includes('pg_catalog.pg_enum')) return { rows: currencies.map((enumlabel) => ({ enumlabel })) };
      if (sql === 'BEGIN') before = new Map(columns);
      if (sql === 'ROLLBACK') columns = before;
      if (sql.startsWith('ALTER TABLE')) {
        const name = sql.match(/EXISTS "(\w+)"/)[1];
        if (name === failOn) throw Object.assign(new Error('test lock timeout'), { code: '55P03' });
        if (!ignoreAlter) columns.set(name, walletColumns[name] === 'varchar' ? 'character varying' : 'text');
      }
      return { rows: [] };
    },
  };
}

test('read-only check detects the exact wallet.address gap from Render', async () => {
  const client = fixture();
  assert.deepEqual(await repairWalletSchema(client), { applied: false, missing: ['address'], added: [] });
  assert.equal(client.queries.length, 1);
});

test('explicit repair adds only missing nullable fields and is idempotent', async () => {
  const client = fixture();
  assert.deepEqual(await repairWalletSchema(client, true), { applied: true, missing: [], added: ['address'] });
  assert.equal(client.queries.find((sql) => sql.startsWith('ALTER')), 'ALTER TABLE "public"."wallet" ADD COLUMN IF NOT EXISTS "address" text NULL');
  assert.equal(client.queries.at(-1), 'COMMIT');
  assert.deepEqual(await repairWalletSchema(client, true), { applied: false, missing: [], added: [] });
  assert.equal(client.queries.filter((sql) => sql.startsWith('ALTER')).length, 1);
});

test('repairs all known nullable provider fields without changing ledger data or provider records', async () => {
  const missing = Object.keys(walletColumns);
  const client = fixture({ missing });
  assert.deepEqual((await repairWalletSchema(client, true)).added, missing);
  assert.ok(client.queries.every((sql) => !/\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/.test(sql)));
  const alterations = client.queries.filter((sql) => sql.startsWith('ALTER'));
  assert.ok(alterations.every((sql) => sql.endsWith(' NULL') && !/balance|DEFAULT|SET NOT NULL/i.test(sql)));
  assert.ok(client.queries.includes("SET LOCAL lock_timeout = '5s'"));
  assert.ok(client.queries.includes("SET LOCAL statement_timeout = '15s'"));
});

test('preserves compatible JSON metadata and existing provider fields', async () => {
  const client = fixture({ missing: [], types: { metadata: 'jsonb' } });
  assert.deepEqual(await repairWalletSchema(client, true), { applied: false, missing: [], added: [] });
  assert.equal(client.queries.length, 1);
});

test('rejects incompatible types before any write', async () => {
  const client = fixture({ types: { providerAccountId: 'integer' } });
  await assert.rejects(repairWalletSchema(client, true), /Unexpected type for wallet.providerAccountId/);
  assert.equal(client.queries.length, 1);
});

test('refuses to recreate a missing wallet table', async () => {
  const client = fixture({ absent: true });
  await assert.rejects(repairWalletSchema(client, true), /public.wallet was not found/);
  assert.equal(client.queries.length, 1);
});

test('refuses to invent missing core financial columns', async () => {
  const client = fixture({ missingCore: ['balance'] });
  await assert.rejects(repairWalletSchema(client, true), /Core wallet fields are missing \(balance\)/);
  assert.equal(client.queries.length, 1);
});

test('rolls back the entire change when a later ALTER fails', async () => {
  const client = fixture({ missing: ['address', 'provider'], failOn: 'provider' });
  await assert.rejects(repairWalletSchema(client, true), /test lock timeout/);
  assert.equal(client.queries.at(-1), 'ROLLBACK');
  assert.ok(!client.queries.includes('COMMIT'));
  assert.deepEqual((await repairWalletSchema(client)).missing, ['address', 'provider']);
});

test('rolls back if verification still reports a missing column', async () => {
  const client = fixture({ ignoreAlter: true });
  await assert.rejects(repairWalletSchema(client, true), /verification failed/);
  assert.equal(client.queries.at(-1), 'ROLLBACK');
  assert.ok(!client.queries.includes('COMMIT'));
});

test('detects unsupported CAD/GBP enum values without silently changing financial types', async () => {
  const client = fixture({ currencies: ['NGN', 'USD'] });
  await assert.rejects(repairWalletSchema(client, true), /does not support GBP, CAD/);
  assert.ok(client.queries.every((sql) => sql.trimStart().startsWith('SELECT')));
});

test('checks required unmapped columns without inventing balance or permission defaults', async () => {
  const client = fixture({ extra: [{ column_name: 'availableBalance', is_nullable: 'NO', column_default: null }] });
  await assert.rejects(repairWalletSchema(client, true), /unmapped fields without defaults \(availableBalance\)/);
  assert.equal(client.queries.length, 1);
});

test('accepts database-managed defaults and supported currency enums without modifying them', async () => {
  const client = fixture({
    currencies: ['NGN', 'USD', 'GBP', 'CAD'],
    extra: [{ column_name: 'availableBalance', is_nullable: 'NO', column_default: '0' }],
  });
  assert.deepEqual((await repairWalletSchema(client, true)).added, ['address']);
});

test('recognizes the four missing fields in the supplied wallet audit', async () => {
  const missing = ['address', 'provider', 'providerStatus', 'metadata'];
  const client = fixture({ missing });
  assert.deepEqual((await repairWalletSchema(client)).missing, missing);
});
