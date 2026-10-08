'use strict';

const fs = require('fs');
const path = require('path');

const DOMAIN_PATTERN = /(user|profile|auth|session|token|kyc|verification|identity|document|wallet|account|balance|transaction|transfer|beneficiar|recipient|notification|provider|fincra|metamap|webhook|card|fx|fee|ledger|journal|reward|referral|support|ticket|dispute|refund|reversal|operation|request|activity)/i;
const FINANCIAL_PATTERN = /(wallet|account|balance|transaction|transfer|deposit|withdrawal|beneficiar|recipient|notification|provider|reference|virtual|ledger|journal|webhook|card|fx|fee|reward|referral|refund|reversal|operation|activity)/i;
const SENSITIVE_NAME_PATTERN = /(password|secret|token|otp|pin|hash|key|authorization|access|refresh|credential|payload|metadata|address|phone|email|name|bvn|nin|ssn|dob|dateofbirth|birth|document|image|photo|pan|cvv)/i;
const AMOUNT_PATTERN = /(amount|balance|fee|charge|total|value|debit|credit)/i;
const CURRENCY_PATTERN = /(currency|ccy)/i;
const STATUS_PATTERN = /(status|state)/i;
const REFERENCE_PATTERN = /(reference|ref|providerReference|external|operation|idempotency)/i;
const PROVIDER_PATTERN = /(provider|fincra|metamap|unit|payvessel|sudo|reloadly|verto|zero|alpaca|april)/i;
const USER_LINK_PATTERN = /^(userId|user_id|customerId|customer_id|ownerId|owner_id|createdBy|created_by)$/i;
const WALLET_LINK_PATTERN = /^(walletId|wallet_id|accountId|account_id|providerAccountId|provider_account_id|virtualAccountId|virtual_account_id)$/i;
const DATE_COLUMN_CANDIDATES = ['createdAt', 'created_at', 'updatedAt', 'updated_at', 'submittedAt', 'submitted_at', 'completedAt', 'completed_at', 'date', 'timestamp'];

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function qualifiedName(schema, name) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

function sslConfiguration(value) {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'disable'].includes(normalized)) return false;
  return { rejectUnauthorized: false };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function columnNames(table) {
  return (table.columns || []).map((column) => column.name);
}

function findColumn(columns, pattern) {
  return columns.find((column) => pattern.test(column));
}

function chooseDateColumn(columns) {
  for (const candidate of DATE_COLUMN_CANDIDATES) {
    const match = columns.find((column) => column.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return columns.find((column) => /created|updated|date|time/i.test(column)) || null;
}

function classifyPurpose(tableName, columns) {
  const text = `${tableName} ${columns.join(' ')}`;
  const purposes = [];
  for (const [label, pattern] of [
    ['users/profiles', /(user|profile|customer)/i],
    ['authentication', /(auth|session|token|login)/i],
    ['KYC/identity', /(kyc|verification|identity|document|metamap)/i],
    ['wallets/accounts/balances', /(wallet|account|balance|virtual)/i],
    ['transactions/transfers', /(transaction|transfer|deposit|withdrawal|payment|money)/i],
    ['beneficiaries', /(beneficiar|recipient|payee)/i],
    ['notifications', /(notification|device|preference|push)/i],
    ['providers/webhooks', /(provider|operation|webhook|fincra|unit|payvessel|sudo|reloadly)/i],
    ['cards', /card/i],
    ['FX/fees', /(fx|conversion|quote|fee|rate)/i],
    ['ledger/journal', /(ledger|journal|entry)/i],
    ['rewards/referrals', /(reward|referral|earning|points)/i],
    ['support/disputes/refunds', /(support|ticket|dispute|refund|reversal)/i],
  ]) {
    if (pattern.test(text)) purposes.push(label);
  }
  return purposes.length ? purposes : ['unclassified'];
}

function safeColumnSummary(columns) {
  return columns.map((column) => ({
    name: column.column_name,
    type: column.data_type,
    databaseType: column.udt_name,
    nullable: column.is_nullable === 'YES',
    ordinal: Number(column.ordinal_position),
  }));
}

function financialColumnMap(table) {
  const columns = columnNames(table);
  return {
    userLinkField: findColumn(columns, USER_LINK_PATTERN) || null,
    transactionReferenceField: findColumn(columns, REFERENCE_PATTERN) || null,
    walletOrAccountLink: findColumn(columns, WALLET_LINK_PATTERN) || null,
    currencyField: findColumn(columns, CURRENCY_PATTERN) || null,
    amountField: findColumn(columns, AMOUNT_PATTERN) || null,
    statusField: findColumn(columns, STATUS_PATTERN) || null,
    providerField: findColumn(columns, PROVIDER_PATTERN) || null,
    dateField: chooseDateColumn(columns),
  };
}

function likelyActiveOrLegacy(tableName) {
  const current = new Set([
    'user',
    'wallet',
    'financial_transaction',
    'provider_operation',
    'beneficiary',
    'notification',
    'notification_device',
    'notification_preference',
    'kyc_profile',
    'card',
    'reward_ledger_entry',
    'referral_event',
    'support_ticket',
    'dispute',
    'auth_session',
    'token',
    'request_log',
  ]);
  return current.has(tableName) ? 'LIKELY_ACTIVE_CURRENT' : 'POSSIBLE_LEGACY';
}

function assertSelectOnly(sql) {
  const normalized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().toUpperCase();
  if (!/^(SELECT|WITH|SHOW)\b/.test(normalized)) {
    throw new Error(`Refusing non-read-only SQL: ${normalized.slice(0, 80)}`);
  }
}

async function safeQuery(client, sql, params = []) {
  assertSelectOnly(sql);
  return client.query(sql, params);
}

async function countRows(client, schema, table) {
  const result = await safeQuery(client, `SELECT COUNT(*)::bigint::text AS row_count FROM ${qualifiedName(schema, table)}`);
  return result.rows[0].row_count;
}

async function dateRange(client, schema, table, dateColumn) {
  if (!dateColumn) return { from: null, to: null };
  const result = await safeQuery(
    client,
    `SELECT MIN(${quoteIdentifier(dateColumn)})::text AS from_date, MAX(${quoteIdentifier(dateColumn)})::text AS to_date FROM ${qualifiedName(schema, table)}`,
  );
  return {
    from: result.rows[0].from_date || null,
    to: result.rows[0].to_date || null,
  };
}

async function distinctCount(client, schema, table, column) {
  if (!column || SENSITIVE_NAME_PATTERN.test(column)) return null;
  const result = await safeQuery(
    client,
    `SELECT COUNT(DISTINCT ${quoteIdentifier(column)})::bigint::text AS count FROM ${qualifiedName(schema, table)} WHERE ${quoteIdentifier(column)} IS NOT NULL`,
  );
  return result.rows[0].count;
}

async function potentialMatches(client, source, destination) {
  if (!source.transactionReferenceField || !destination.transactionReferenceField) {
    return { potentialMatches: '0', uniqueLegacyRows: source.rowCount, conflicts: 'UNKNOWN_NO_REFERENCE_FIELD' };
  }
  const sourceName = qualifiedName(source.schema, source.table);
  const destName = qualifiedName(destination.schema, destination.table);
  const srcRef = quoteIdentifier(source.transactionReferenceField);
  const dstRef = quoteIdentifier(destination.transactionReferenceField);
  const result = await safeQuery(
    client,
    `SELECT
       COUNT(*) FILTER (WHERE d.${dstRef} IS NOT NULL)::bigint::text AS potential_matches,
       COUNT(*) FILTER (WHERE d.${dstRef} IS NULL)::bigint::text AS unique_legacy_rows
     FROM ${sourceName} s
     LEFT JOIN ${destName} d ON d.${dstRef}::text = s.${srcRef}::text
     WHERE s.${srcRef} IS NOT NULL`,
  );
  return {
    potentialMatches: result.rows[0].potential_matches,
    uniqueLegacyRows: result.rows[0].unique_legacy_rows,
    conflicts: 'NOT_EVALUATED_AGGREGATE_ONLY',
  };
}

async function runInventory(options = {}) {
  const { Client } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. No production database connection was attempted.');
  }

  const client = new Client({
    connectionString,
    ssl: sslConfiguration(process.env.DB_SSL),
    connectionTimeoutMillis: parsePositiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
    application_name: 'vidalpay-readonly-inventory',
  });

  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '3s'");

    const [schemas, tables, views, columns, enums, sequences, indexes, constraints, foreignKeys] = await Promise.all([
      safeQuery(client, `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema' ORDER BY schema_name`),
      safeQuery(client, `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema' ORDER BY table_schema, table_name`),
      safeQuery(client, `SELECT table_schema, table_name AS view_name FROM information_schema.views WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema' ORDER BY table_schema, table_name`),
      safeQuery(client, `SELECT table_schema, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema NOT LIKE 'pg_%' AND table_schema <> 'information_schema' ORDER BY table_schema, table_name, ordinal_position`),
      safeQuery(client, `SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS enum_value, e.enumsortorder FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace ORDER BY n.nspname, t.typname, e.enumsortorder`),
      safeQuery(client, `SELECT sequence_schema, sequence_name, data_type FROM information_schema.sequences WHERE sequence_schema NOT LIKE 'pg_%' AND sequence_schema <> 'information_schema' ORDER BY sequence_schema, sequence_name`),
      safeQuery(client, `SELECT schemaname AS schema, tablename AS table_name, indexname AS index_name, indexdef AS definition FROM pg_indexes WHERE schemaname NOT LIKE 'pg_%' ORDER BY schemaname, tablename, indexname`),
      safeQuery(client, `SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name FROM information_schema.table_constraints tc LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema AND tc.table_name = kcu.table_name WHERE tc.table_schema NOT LIKE 'pg_%' AND tc.table_schema <> 'information_schema' ORDER BY tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position`),
      safeQuery(client, `SELECT tc.table_schema, tc.table_name, tc.constraint_name, kcu.column_name, ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema NOT LIKE 'pg_%' AND tc.table_schema <> 'information_schema' ORDER BY tc.table_schema, tc.table_name, tc.constraint_name`),
    ]);

    const columnRows = columns.rows;
    const indexRows = indexes.rows;
    const constraintRows = constraints.rows;
    const fkRows = foreignKeys.rows;

    const tableSummaries = [];
    for (const row of tables.rows.filter((item) => item.table_type === 'BASE TABLE')) {
      const tableColumns = columnRows.filter((column) => column.table_schema === row.table_schema && column.table_name === row.table_name);
      const columnSummary = safeColumnSummary(tableColumns);
      const names = columnSummary.map((column) => column.name);
      const fieldMap = financialColumnMap({ columns: columnSummary });
      const rowCount = await countRows(client, row.table_schema, row.table_name);
      const range = await dateRange(client, row.table_schema, row.table_name, fieldMap.dateField);
      tableSummaries.push({
        schema: row.table_schema,
        table: row.table_name,
        purposes: classifyPurpose(row.table_name, names),
        likelyActiveOrLegacy: likelyActiveOrLegacy(row.table_name),
        relevantToFinancialRestore: FINANCIAL_PATTERN.test(`${row.table_name} ${names.join(' ')}`),
        rowCount,
        dateRange: range,
        fields: fieldMap,
        safeDistinctCounts: {
          users: await distinctCount(client, row.table_schema, row.table_name, fieldMap.userLinkField),
          currencies: await distinctCount(client, row.table_schema, row.table_name, fieldMap.currencyField),
          providers: await distinctCount(client, row.table_schema, row.table_name, fieldMap.providerField),
          statuses: await distinctCount(client, row.table_schema, row.table_name, fieldMap.statusField),
        },
        columns: columnSummary,
        indexes: indexRows
          .filter((index) => index.schema === row.table_schema && index.table_name === row.table_name)
          .map(({ index_name, definition }) => ({ name: index_name, definition })),
        constraints: constraintRows
          .filter((constraint) => constraint.table_schema === row.table_schema && constraint.table_name === row.table_name)
          .map(({ constraint_name, constraint_type, column_name }) => ({ name: constraint_name, type: constraint_type, column: column_name })),
        foreignKeys: fkRows
          .filter((fk) => fk.table_schema === row.table_schema && fk.table_name === row.table_name)
          .map(({ constraint_name, column_name, foreign_table_schema, foreign_table_name, foreign_column_name }) => ({
            name: constraint_name,
            column: column_name,
            references: { schema: foreign_table_schema, table: foreign_table_name, column: foreign_column_name },
          })),
      });
    }

    const currentTransaction = tableSummaries.find((table) => table.table === 'financial_transaction');
    const comparison = [];
    if (currentTransaction) {
      for (const source of tableSummaries.filter((table) => table.relevantToFinancialRestore && table.table !== 'financial_transaction' && /transaction|transfer|ledger|journal|wallet|account|operation|activity/i.test(table.table))) {
        comparison.push({
          source: `${source.schema}.${source.table}`,
          currentDestination: `${currentTransaction.schema}.${currentTransaction.table}`,
          rows: source.rowCount,
          ...(await potentialMatches(client, source, currentTransaction)),
        });
      }
    }

    const usersTable = tableSummaries.find((table) => table.table === 'user');
    const walletsTable = tableSummaries.find((table) => table.table === 'wallet');
    const coverage = {
      totalUsers: usersTable?.rowCount ?? '0',
      usersWithCurrentFinancialTransactionRows: currentTransaction?.safeDistinctCounts.users ?? '0',
      usersWithCurrentWallets: walletsTable?.safeDistinctCounts.users ?? '0',
      usersWithPossibleLegacyFinancialRows: tableSummaries
        .filter((table) => table.relevantToFinancialRestore && table.likelyActiveOrLegacy === 'POSSIBLE_LEGACY')
        .map((table) => ({ table: `${table.schema}.${table.table}`, users: table.safeDistinctCounts.users, rows: table.rowCount })),
      usersWithProviderReferences: tableSummaries
        .filter((table) => table.fields.providerField || /provider/i.test(table.table))
        .map((table) => ({ table: `${table.schema}.${table.table}`, users: table.safeDistinctCounts.users, rows: table.rowCount })),
      usersWithNoIdentifiableFinancialActivity: 'DERIVE_AFTER_REVIEW_WITH_AUTHORIZED_SQL',
    };

    const output = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      productionMutationExecuted: false,
      includesCustomerValues: false,
      schemas: schemas.rows.map((row) => row.schema_name),
      views: views.rows.map((row) => ({ schema: row.table_schema, name: row.view_name })),
      enums: enums.rows.reduce((acc, row) => {
        const key = `${row.schema}.${row.enum_name}`;
        const found = acc.find((item) => item.name === key);
        if (found) found.values.push(row.enum_value);
        else acc.push({ schema: row.schema, enumName: row.enum_name, name: key, values: [row.enum_value] });
        return acc;
      }, []),
      sequences: sequences.rows.map((row) => ({ schema: row.sequence_schema, name: row.sequence_name, type: row.data_type })),
      tables: tableSummaries,
      currentFinancialTables: tableSummaries.filter((table) => table.likelyActiveOrLegacy === 'LIKELY_ACTIVE_CURRENT' && table.relevantToFinancialRestore),
      possibleLegacyTables: tableSummaries.filter((table) => table.likelyActiveOrLegacy === 'POSSIBLE_LEGACY' && table.relevantToFinancialRestore),
      duplicateConflictAnalysis: comparison,
      historicalCoverage: coverage,
      walletEnumAudit: {
        targetWalletCurrencies: ['NGN', 'USD', 'GBP', 'CAD'],
        eurIsTargetWalletCurrency: false,
        enumCandidates: enums.rows.filter((row) => /currency|wallet/i.test(row.enum_name)).map((row) => ({ schema: row.schema, enumName: row.enum_name, value: row.enum_value })),
        walletCurrencyColumns: columnRows
          .filter((column) => /currency/i.test(column.column_name) && /wallet|transaction|operation|card/i.test(column.table_name))
          .map((column) => ({ schema: column.table_schema, table: column.table_name, column: column.column_name, dataType: column.data_type, databaseType: column.udt_name })),
      },
    };

    if (options.outputPath) {
      fs.writeFileSync(options.outputPath, `${JSON.stringify(output, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    }

    await client.query('ROLLBACK');
    return output;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

function parseArgs(argv) {
  const outputIndex = argv.indexOf('--output');
  return {
    outputPath: outputIndex >= 0 ? path.resolve(argv[outputIndex + 1]) : null,
  };
}

if (require.main === module) {
  runInventory(parseArgs(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`Read-only production inventory failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertSelectOnly,
  classifyPurpose,
  columnNames,
  financialColumnMap,
  likelyActiveOrLegacy,
  quoteIdentifier,
  runInventory,
  sslConfiguration,
};
