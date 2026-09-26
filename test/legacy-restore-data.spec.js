'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildRows,
  normalizeAmount,
  normalizeCurrency,
  parseArgs,
  validateRows,
} = require('../scripts/restore-legacy-data');

test('normalizes transaction rows from a reviewed legacy mapping', () => {
  const rows = buildRows(
    'transactions',
    [
      {
        id: 'legacy-tx-1',
        user_id: 'user-1',
        wallet_id: 'wallet-1',
        ref: 'ref-1',
        currency_code: 'ngn',
        amount_value: '1200.129',
        direction: 'sent',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    {
      sourceTable: 'old_transactions',
      columnMap: {
        userId: 'user_id',
        walletId: 'wallet_id',
        reference: 'ref',
        currency: 'currency_code',
        amount: 'amount_value',
        type: 'direction',
        createdAt: 'created_at',
      },
    },
  );

  assert.equal(rows[0].userId, 'user-1');
  assert.equal(rows[0].walletId, 'wallet-1');
  assert.equal(rows[0].reference, 'ref-1');
  assert.equal(rows[0].currency, 'NGN');
  assert.equal(rows[0].amount, 1200.13);
  assert.equal(rows[0].type, 'debit');
  assert.equal(rows[0].metadata.legacySourceTable, 'old_transactions');
  assert.deepEqual(validateRows('transactions', rows), []);
});

test('reports validation errors before restore apply', () => {
  const rows = buildRows('transactions', [{}], {
    sourceTable: 'old_transactions',
    columnMap: {},
  });

  assert.match(
    validateRows('transactions', rows)
      .map((error) => error.column)
      .join(','),
    /userId/,
  );
});

test('normalizes common restore scalar values', () => {
  assert.equal(normalizeCurrency('usd'), 'USD');
  assert.equal(normalizeCurrency('cad'), null);
  assert.equal(normalizeAmount('9.999'), 10);
  assert.deepEqual(parseArgs(['node', 'restore', '--apply', '--limit', '2']), {
    mappingPath: 'legacy-restore-mapping.json',
    apply: true,
    limit: 2,
  });
});
