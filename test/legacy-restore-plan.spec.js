'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { classifyTables } = require('../scripts/plan-legacy-restore');

test('classifies likely restore tables without customer values', () => {
  const domains = classifyTables([
    {
      table: 'old_transactions',
      rowCount: '12',
      columns: [
        { name: 'user_id' },
        { name: 'wallet_id' },
        { name: 'amount' },
        { name: 'currency' },
      ],
    },
    {
      table: 'saved_beneficiaries',
      rowCount: '4',
      columns: [
        { name: 'user_id' },
        { name: 'account_number' },
        { name: 'bank_name' },
      ],
    },
    {
      table: 'push_notifications',
      rowCount: '8',
      columns: [{ name: 'user_id' }, { name: 'title' }, { name: 'body' }],
    },
  ]);

  assert.equal(
    domains.find((domain) => domain.domain === 'transactions')?.candidates[0]
      ?.table,
    'old_transactions',
  );
  assert.equal(
    domains.find((domain) => domain.domain === 'beneficiaries')?.candidates[0]
      ?.table,
    'saved_beneficiaries',
  );
  assert.equal(
    domains.find((domain) => domain.domain === 'notifications')?.candidates[0]
      ?.table,
    'push_notifications',
  );
  assert.equal(
    domains.every((domain) => domain.readyForMerge === false),
    true,
  );
});
