'use strict';

const assert = require('node:assert/strict');
const { quoteIdentifier, sslConfiguration } = require('./audit-legacy-data');

assert.equal(quoteIdentifier('financial_transaction'), '"financial_transaction"');
assert.equal(quoteIdentifier('unsafe"name'), '"unsafe""name"');
assert.equal(sslConfiguration('false'), false);
assert.equal(sslConfiguration('true').rejectUnauthorized, false);
assert.equal(sslConfiguration(undefined), undefined);

process.stdout.write('Legacy data audit helper tests passed.\n');
