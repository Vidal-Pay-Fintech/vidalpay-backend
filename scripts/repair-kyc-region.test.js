'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { repairKycRegion } = require('./repair-kyc-region');

function fixture(initial = ['id', 'countryCode', 'residency'], failAlter = false) {
  const columns = new Set(initial);
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes('information_schema')) {
        return { rows: [...columns].map((column_name) => ({ column_name, data_type: 'character varying' })) };
      }
      if (sql.startsWith('ALTER TABLE')) {
        if (failAlter) throw new Error('test lock timeout');
        columns.add(sql.match(/EXISTS "(\w+)"/)[1]);
      }
      return { rows: [] };
    },
  };
}

test('default check detects the logged missing region without writing', async () => {
  const client = fixture();
  assert.deepEqual(await repairKycRegion(client), { applied: false, missing: ['region'], added: [] });
  assert.equal(client.queries.length, 1);
});

test('explicit repair adds only missing nullable columns and is idempotent', async () => {
  const client = fixture();
  assert.deepEqual(await repairKycRegion(client, true), { applied: true, missing: [], added: ['region'] });
  assert.equal(client.queries.filter((sql) => sql.startsWith('ALTER')).length, 1);
  assert.match(client.queries.find((sql) => sql.startsWith('ALTER')), /"public"\."user".*"region" varchar NULL/);
  assert.equal(client.queries.at(-1), 'COMMIT');
  assert.equal((await repairKycRegion(client, true)).applied, false);
});

test('older schemas receive all three fields without updates or deletion', async () => {
  const client = fixture(['id']);
  assert.deepEqual((await repairKycRegion(client, true)).added, ['countryCode', 'residency', 'region']);
  assert.ok(client.queries.every((sql) => !/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/.test(sql)));
});

test('a failed repair is rolled back', async () => {
  const client = fixture(undefined, true);
  await assert.rejects(repairKycRegion(client, true), /test lock timeout/);
  assert.equal(client.queries.at(-1), 'ROLLBACK');
  assert.ok(!client.queries.includes('COMMIT'));
});

test('missing user table fails without creating a replacement', async () => {
  const client = fixture([]);
  await assert.rejects(repairKycRegion(client, true), /public.user was not found/);
  assert.equal(client.queries.length, 1);
});
