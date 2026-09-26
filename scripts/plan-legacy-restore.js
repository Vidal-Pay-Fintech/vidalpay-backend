'use strict';

const fs = require('fs');

const DOMAIN_RULES = [
  {
    domain: 'users',
    patterns: [/^users?$/i, /customer/i],
    requiredAny: ['id'],
  },
  {
    domain: 'wallets',
    patterns: [/wallet/i, /account/i],
    requiredAny: ['userId', 'user_id', 'currency'],
  },
  {
    domain: 'transactions',
    patterns: [/transaction/i, /ledger/i, /journal/i, /statement/i],
    requiredAny: [
      'amount',
      'currency',
      'userId',
      'user_id',
      'walletId',
      'wallet_id',
    ],
  },
  {
    domain: 'beneficiaries',
    patterns: [/beneficiar/i, /recipient/i, /saved.*payee/i],
    requiredAny: [
      'userId',
      'user_id',
      'tagId',
      'tag_id',
      'accountNumber',
      'account_number',
    ],
  },
  {
    domain: 'notifications',
    patterns: [/notification/i, /device/i, /preference/i],
    requiredAny: ['userId', 'user_id', 'title', 'body', 'token'],
  },
  {
    domain: 'kyc',
    patterns: [/kyc/i, /verification/i, /identity/i, /document/i],
    requiredAny: [
      'userId',
      'user_id',
      'status',
      'providerReference',
      'provider_reference',
    ],
  },
  {
    domain: 'rewards',
    patterns: [/reward/i, /referral/i, /earning/i, /points/i],
    requiredAny: ['userId', 'user_id', 'points', 'amount', 'reference'],
  },
  {
    domain: 'activity',
    patterns: [/activity/i, /audit/i, /event/i, /log/i],
    requiredAny: ['userId', 'user_id', 'type', 'action', 'event'],
  },
];

function loadAudit(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.tables)) {
    throw new Error('Audit file must contain a tables array.');
  }
  return parsed;
}

function columnNames(table) {
  return (table.columns ?? []).map((column) => column.name);
}

function scoreTable(table, rule) {
  const tableName = table.table ?? '';
  const columns = columnNames(table);
  const columnText = columns.join(' ');
  const nameScore = rule.patterns.some((pattern) => pattern.test(tableName))
    ? 3
    : 0;
  const columnPatternScore = rule.patterns.some((pattern) =>
    pattern.test(columnText),
  )
    ? 1
    : 0;
  const requiredHits = rule.requiredAny.filter((name) =>
    columns.some((column) => column.toLowerCase() === name.toLowerCase()),
  ).length;
  const rowCount = Number(table.rowCount ?? 0);
  const dataScore = rowCount > 0 ? 1 : 0;
  return nameScore + columnPatternScore + requiredHits + dataScore;
}

function classifyTables(tables) {
  return DOMAIN_RULES.map((rule) => {
    const candidates = tables
      .map((table) => ({
        table: table.table,
        rowCount: table.rowCount,
        score: scoreTable(table, rule),
        columns: columnNames(table),
        indexes: (table.indexes ?? []).map((index) => index.name),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return Number(right.rowCount ?? 0) - Number(left.rowCount ?? 0);
      });

    return {
      domain: rule.domain,
      candidates,
      readyForMerge: false,
      nextStep:
        candidates.length > 0
          ? 'Review candidate source and destination columns before writing a merge script.'
          : 'No likely source table found in this audit.',
    };
  });
}

function plan(filePath) {
  const audit = loadAudit(filePath);
  return {
    generatedAt: new Date().toISOString(),
    sourceAuditGeneratedAt: audit.generatedAt ?? null,
    readOnly: true,
    includesCustomerValues: false,
    mergeExecuted: false,
    domains: classifyTables(audit.tables),
    safetyChecksRequiredBeforeApply: [
      'Render PostgreSQL backup or recovery point',
      'reviewed source-to-destination column mapping',
      'dry-run duplicate and orphan report',
      'single transaction with advisory lock',
      'idempotent conflict handling',
    ],
  };
}

if (require.main === module) {
  const filePath = process.argv[2] ?? 'legacy-data-audit.json';
  try {
    process.stdout.write(`${JSON.stringify(plan(filePath), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Legacy restore planning failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { classifyTables, loadAudit, plan, scoreTable };
