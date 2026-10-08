const {
  assertSelectOnly,
  classifyPurpose,
  financialColumnMap,
  likelyActiveOrLegacy,
  quoteIdentifier,
  sslConfiguration,
} = require('./readonly-production-inventory');

describe('readonly-production-inventory helpers', () => {
  it('quotes identifiers safely', () => {
    expect(quoteIdentifier('wallet')).toBe('"wallet"');
    expect(quoteIdentifier('bad"name')).toBe('"bad""name"');
  });

  it('rejects mutating sql', () => {
    expect(() => assertSelectOnly('SELECT 1')).not.toThrow();
    expect(() => assertSelectOnly('WITH rows AS (SELECT 1) SELECT * FROM rows')).not.toThrow();
    expect(() => assertSelectOnly('UPDATE wallet SET balance = 0')).toThrow(/Refusing/);
    expect(() => assertSelectOnly("ALTER TYPE wallet_currency_enum ADD VALUE 'GBP'")).toThrow(/Refusing/);
  });

  it('classifies financial fields without customer values', () => {
    expect(
      financialColumnMap({
        columns: [
          { name: 'userId' },
          { name: 'walletId' },
          { name: 'reference' },
          { name: 'currency' },
          { name: 'amount' },
          { name: 'status' },
          { name: 'provider' },
          { name: 'createdAt' },
        ],
      }),
    ).toMatchObject({
      userLinkField: 'userId',
      walletOrAccountLink: 'walletId',
      transactionReferenceField: 'reference',
      currencyField: 'currency',
      amountField: 'amount',
      statusField: 'status',
      providerField: 'provider',
      dateField: 'createdAt',
    });
  });

  it('identifies current versus possible legacy tables', () => {
    expect(likelyActiveOrLegacy('financial_transaction')).toBe('LIKELY_ACTIVE_CURRENT');
    expect(likelyActiveOrLegacy('transactions')).toBe('POSSIBLE_LEGACY');
  });

  it('maps db ssl settings safely', () => {
    expect(sslConfiguration('false')).toBe(false);
    expect(sslConfiguration('true')).toEqual({ rejectUnauthorized: false });
  });

  it('classifies likely table purpose', () => {
    expect(classifyPurpose('beneficiaries', ['userId', 'accountNumber'])).toContain('beneficiaries');
    expect(classifyPurpose('financial_transaction', ['amount', 'currency'])).toContain('transactions/transfers');
  });
});
