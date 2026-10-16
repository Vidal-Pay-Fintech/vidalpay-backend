'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { repairWalletCurrencies } = require('./repair-wallet-currencies');

function fixture({ values = ['NGN', 'USD'], schema = 'public', name = 'wallet_currency_enum', kind = 'e', absent = false, shared = false, version = '160000', failOn, ignoreAlter = false, changedType = false } = {}) {
  let labels = [...values];
  let snapshot;
  const queries = [];
  return {
    queries,
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (sql.includes('AS type_oid')) {
        return { rows: absent ? [] : [{ type_oid: changedType && snapshot ? '200' : '100', type_schema: schema, type_name: name, type_kind: kind }] };
      }
      if (sql.includes('SELECT enumlabel')) return { rows: labels.map((enumlabel) => ({ enumlabel })) };
      if (sql.includes('AS schema_name')) {
        return { rows: [
          { schema_name: 'public', table_name: 'wallet', column_name: 'currency' },
          ...(shared ? [{ schema_name: 'public', table_name: 'transaction', column_name: 'currency' }] : []),
        ] };
      }
      if (sql.startsWith('SHOW')) return { rows: [{ server_version_num: version }] };
      if (sql === 'BEGIN') snapshot = [...labels];
      if (sql === 'ROLLBACK') labels = snapshot;
      if (sql.startsWith('ALTER TYPE')) {
        const value = sql.match(/EXISTS '(GBP|CAD)'$/)?.[1];
        assert.ok(value);
        if (value === failOn) throw Object.assign(new Error('test lock timeout'), { code: '55P03' });
        if (!ignoreAlter && !labels.includes(value)) labels.push(value);
      }
      return { rows: [] };
    },
  };
}

test('default check reports the missing GBP and CAD without executing DDL', async () => {
  const client = fixture();
  assert.deepEqual(await repairWalletCurrencies(client), {
    applied: false, enumType: { schema: 'public', name: 'wallet_currency_enum' },
    values: ['NGN', 'USD'], missing: ['GBP', 'CAD'], added: [],
  });
  assert.ok(client.queries.every(({ sql }) => sql.trimStart().startsWith('SELECT')));
});

test('explicit apply commits only additive enum changes and is idempotent', async () => {
  const client = fixture();
  assert.deepEqual((await repairWalletCurrencies(client, true)).added, ['GBP', 'CAD']);
  assert.equal(client.queries.at(-1).sql, 'COMMIT');
  const changes = client.queries.filter(({ sql }) => sql.startsWith('ALTER'));
  assert.deepEqual(changes.map(({ sql }) => sql), [
    `ALTER TYPE "public"."wallet_currency_enum" ADD VALUE IF NOT EXISTS 'GBP'`,
    `ALTER TYPE "public"."wallet_currency_enum" ADD VALUE IF NOT EXISTS 'CAD'`,
  ]);
  assert.ok(client.queries.every(({ sql }) => !/\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT|CREATE)\b/.test(sql)));
  assert.equal((await repairWalletCurrencies(client, true)).applied, false);
  assert.equal(client.queries.filter(({ sql }) => sql.startsWith('ALTER')).length, 2);
});

test('preserves other existing enum values and adds only the missing value', async () => {
  const client = fixture({ values: ['USD', 'NGN', 'GBP', 'EUR'] });
  const result = await repairWalletCurrencies(client, true);
  assert.deepEqual(result.added, ['CAD']);
  assert.deepEqual(result.values, ['USD', 'NGN', 'GBP', 'EUR', 'CAD']);
});

test('discovers and quotes the actual attached enum instead of assuming a type name', async () => {
  const client = fixture({ schema: 'finance"schema', name: 'wallet"type' });
  await repairWalletCurrencies(client, true);
  assert.equal(client.queries.find(({ sql }) => sql.startsWith('ALTER')).sql,
    `ALTER TYPE "finance""schema"."wallet""type" ADD VALUE IF NOT EXISTS 'GBP'`);
});

test('rolls back both changes when the second enum addition fails', async () => {
  const client = fixture({ failOn: 'CAD' });
  await assert.rejects(repairWalletCurrencies(client, true), /test lock timeout/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.queries.some(({ sql }) => sql === 'COMMIT'));
  assert.deepEqual((await repairWalletCurrencies(client)).values, ['NGN', 'USD']);
});

test('bounds lock and statement waits and protects the inspected column binding', async () => {
  const client = fixture();
  await repairWalletCurrencies(client, true);
  const sql = client.queries.map((entry) => entry.sql);
  assert.ok(sql.includes("SET LOCAL lock_timeout = '5s'"));
  assert.ok(sql.includes("SET LOCAL statement_timeout = '15s'"));
  assert.ok(sql.indexOf('LOCK TABLE "public"."wallet" IN ACCESS SHARE MODE') < sql.findIndex((entry) => entry.startsWith('ALTER')));
});

for (const [description, options, message] of [
  ['missing wallet column', { absent: true }, /must exist/],
  ['non-enum currency', { kind: 'b' }, /must exist/],
  ['unexpected starting currencies', { values: ['EUR', 'JPY'] }, /both NGN and USD/],
  ['enum shared with other tables', { shared: true }, /shared with other table columns/],
  ['unsupported PostgreSQL version', { version: '110000' }, /PostgreSQL 12 or newer/],
]) {
  test(`refuses ${description} without writes`, async () => {
    const client = fixture(options);
    await assert.rejects(repairWalletCurrencies(client, true), message);
    assert.ok(client.queries.every(({ sql }) => /^(SELECT|SHOW)/.test(sql.trimStart())));
  });
}

test('rolls back if the enum binding changed during inspection', async () => {
  const client = fixture({ changedType: true });
  await assert.rejects(repairWalletCurrencies(client, true), /type changed/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.queries.some(({ sql }) => sql.startsWith('ALTER')));
});

test('does not report success when verification fails', async () => {
  const client = fixture({ ignoreAlter: true });
  await assert.rejects(repairWalletCurrencies(client, true), /verification failed/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
});
