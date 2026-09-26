'use strict';

const fs = require('fs');
const { randomUUID } = require('crypto');
const { quoteIdentifier, sslConfiguration } = require('./audit-legacy-data');

const TARGETS = {
  transactions: {
    table: 'financial_transaction',
    uniqueColumns: ['reference'],
    required: ['userId', 'reference', 'currency', 'amount', 'type'],
    columns: [
      'id',
      'userId',
      'walletId',
      'reference',
      'operationReference',
      'currency',
      'amount',
      'balanceBefore',
      'balanceAfter',
      'type',
      'status',
      'info',
      'description',
      'tag',
      'provider',
      'providerReference',
      'idempotencyKey',
      'metadata',
      'createdAt',
      'updatedAt',
    ],
    defaults: {
      walletId: null,
      operationReference: null,
      balanceBefore: 0,
      balanceAfter: 0,
      status: 'SUCCESS',
      info: 'Legacy transaction',
      description: null,
      tag: 'legacy_restore',
      provider: 'VidalPay Legacy',
      providerReference: null,
      idempotencyKey: null,
      metadata: {},
    },
  },
  beneficiaries: {
    table: 'beneficiary',
    uniqueColumns: ['userId', 'currency', 'accountNumber', 'tagId'],
    required: ['userId'],
    columns: [
      'id',
      'userId',
      'name',
      'firstName',
      'lastName',
      'type',
      'rail',
      'tagId',
      'currency',
      'accountNumber',
      'accountName',
      'bankName',
      'routingNumber',
      'metadata',
      'createdAt',
      'updatedAt',
    ],
    defaults: {
      name: null,
      firstName: null,
      lastName: null,
      type: 'legacy',
      rail: null,
      tagId: null,
      currency: null,
      accountNumber: null,
      accountName: null,
      bankName: null,
      routingNumber: null,
      metadata: {},
    },
  },
  notifications: {
    table: 'notification',
    uniqueColumns: ['id'],
    required: ['userId', 'title', 'body'],
    columns: [
      'id',
      'userId',
      'title',
      'body',
      'category',
      'read',
      'metadata',
      'createdAt',
      'updatedAt',
    ],
    defaults: {
      category: 'Legacy',
      read: false,
      metadata: {},
    },
  },
  activities: {
    table: 'provider_operation',
    uniqueColumns: ['reference'],
    required: ['userId', 'type', 'idempotencyKey', 'reference', 'status'],
    columns: [
      'id',
      'userId',
      'type',
      'idempotencyKey',
      'reference',
      'status',
      'amount',
      'currency',
      'provider',
      'providerReference',
      'requestPayload',
      'responsePayload',
      'errorCode',
      'failureReason',
      'metadata',
      'createdAt',
      'updatedAt',
    ],
    defaults: {
      type: 'legacy_activity',
      status: 'APPLIED',
      amount: null,
      currency: null,
      provider: 'VidalPay Legacy',
      providerReference: null,
      requestPayload: null,
      responsePayload: null,
      errorCode: null,
      failureReason: null,
      metadata: {},
    },
  },
};

function parseArgs(argv) {
  const args = {
    mappingPath: 'legacy-restore-mapping.json',
    apply: false,
    limit: null,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--mapping') {
      args.mappingPath = argv[++index];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++index]);
    }
  }
  return args;
}

function loadMapping(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed.domains || typeof parsed.domains !== 'object') {
    throw new Error('Mapping file must contain a domains object.');
  }
  return parsed;
}

function readPath(source, path) {
  if (!path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function normalizeType(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['debit', 'withdrawal', 'out', 'sent', 'payment'].includes(normalized)) {
    return 'debit';
  }
  return 'credit';
}

function normalizeCurrency(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return normalized === 'USD' ? 'USD' : normalized === 'NGN' ? 'NGN' : null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  return ['true', '1', 'yes', 'read'].includes(normalized);
}

function normalizeAmount(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function fallbackReference(domain, sourceTable, source) {
  return `legacy_${domain}_${sourceTable}_${source.id ?? source.reference ?? randomUUID()}`;
}

function targetValue(domain, targetColumn, source, config, targetConfig) {
  const map = config.columnMap ?? {};
  const constants = config.constants ?? {};
  const defaults = { ...targetConfig.defaults, ...(config.defaults ?? {}) };

  if (Object.prototype.hasOwnProperty.call(constants, targetColumn)) {
    return constants[targetColumn];
  }
  const mapped = readPath(source, map[targetColumn]);
  if (mapped !== undefined && mapped !== null && mapped !== '') {
    if (targetColumn === 'currency') return normalizeCurrency(mapped);
    if (targetColumn === 'amount') return normalizeAmount(mapped);
    if (targetColumn === 'type' && domain === 'transactions') {
      return normalizeType(mapped);
    }
    if (targetColumn === 'read') return normalizeBoolean(mapped);
    return mapped;
  }
  if (targetColumn === 'id') return randomUUID();
  if (targetColumn === 'reference') {
    return (
      defaults.reference ??
      fallbackReference(domain, config.sourceTable, source)
    );
  }
  if (targetColumn === 'idempotencyKey') {
    return (
      readPath(source, map.reference) ??
      defaults.idempotencyKey ??
      fallbackReference(domain, config.sourceTable, source)
    );
  }
  if (targetColumn === 'metadata') {
    return {
      ...(defaults.metadata ?? {}),
      legacyRestore: true,
      legacySourceTable: config.sourceTable,
      legacySourceId: source.id ?? null,
    };
  }
  if (targetColumn === 'createdAt' || targetColumn === 'updatedAt') {
    return (
      readPath(source, map[targetColumn]) ??
      source.createdAt ??
      source.created_at ??
      new Date().toISOString()
    );
  }
  return defaults[targetColumn] ?? null;
}

function buildRows(domain, sourceRows, config) {
  const targetConfig = TARGETS[domain];
  if (!targetConfig) throw new Error(`Unsupported restore domain: ${domain}`);
  return sourceRows.map((source) => {
    const row = {};
    for (const column of targetConfig.columns) {
      row[column] = targetValue(domain, column, source, config, targetConfig);
    }
    return row;
  });
}

function validateRows(domain, rows) {
  const targetConfig = TARGETS[domain];
  const errors = [];
  rows.forEach((row, index) => {
    targetConfig.required.forEach((column) => {
      if (
        row[column] === null ||
        row[column] === undefined ||
        row[column] === ''
      ) {
        errors.push({ index, column, reason: 'required value missing' });
      }
    });
    if (domain === 'transactions' && !['credit', 'debit'].includes(row.type)) {
      errors.push({ index, column: 'type', reason: 'must be credit or debit' });
    }
  });
  return errors;
}

async function tableExists(client, tableName) {
  const result = await client.query(`SELECT to_regclass($1) AS table_name`, [
    `public.${tableName}`,
  ]);
  return Boolean(result.rows[0]?.table_name);
}

async function loadSourceRows(client, config, limit) {
  const sql = `SELECT * FROM ${quoteIdentifier(config.sourceTable)}${
    limit ? ` LIMIT ${Number(limit)}` : ''
  }`;
  return (await client.query(sql)).rows;
}

async function countExisting(client, domain, rows) {
  const targetConfig = TARGETS[domain];
  if (rows.length === 0) return 0;
  if (targetConfig.uniqueColumns.length === 1) {
    const column = targetConfig.uniqueColumns[0];
    const values = rows.map((row) => row[column]).filter(Boolean);
    if (values.length === 0) return 0;
    const result = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(
        targetConfig.table,
      )} WHERE ${quoteIdentifier(column)} = ANY($1)`,
      [values],
    );
    return result.rows[0].count;
  }
  return 0;
}

async function unresolvedUsers(client, rows) {
  const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
  if (userIds.length === 0) return [];
  const result = await client.query(
    `SELECT id FROM ${quoteIdentifier('user')} WHERE id = ANY($1)`,
    [userIds],
  );
  const existing = new Set(result.rows.map((row) => row.id));
  return userIds.filter((id) => !existing.has(id));
}

async function insertRows(client, domain, rows) {
  const targetConfig = TARGETS[domain];
  let inserted = 0;
  for (const row of rows) {
    const columns = targetConfig.columns;
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const conflict = targetConfig.uniqueColumns
      .map((column) => quoteIdentifier(column))
      .join(', ');
    const sql = `
      INSERT INTO ${quoteIdentifier(targetConfig.table)}
        (${columns.map(quoteIdentifier).join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (${conflict}) DO NOTHING
      RETURNING id
    `;
    const values = columns.map((column) =>
      typeof row[column] === 'object' && row[column] !== null
        ? JSON.stringify(row[column])
        : row[column],
    );
    const result = await client.query(sql, values);
    inserted += result.rowCount;
  }
  return inserted;
}

async function restore({ mappingPath, apply, limit }) {
  const { Client } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. No database connection was attempted.',
    );
  }
  const mapping = loadMapping(mappingPath);
  const client = new Client({
    connectionString,
    ssl: sslConfiguration(process.env.DB_SSL),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  });
  await client.connect();
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: !apply,
    applied: false,
    domains: [],
  };

  try {
    if (apply) {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(94100926)');
    }

    for (const [domain, config] of Object.entries(mapping.domains)) {
      if (!config || config.enabled === false) continue;
      if (!TARGETS[domain])
        throw new Error(`Unsupported restore domain: ${domain}`);
      if (!config.sourceTable) {
        throw new Error(`Mapping for ${domain} must include sourceTable.`);
      }
      const targetConfig = TARGETS[domain];
      const sourceExists = await tableExists(client, config.sourceTable);
      const targetExists = await tableExists(client, targetConfig.table);
      if (!sourceExists || !targetExists) {
        report.domains.push({
          domain,
          sourceTable: config.sourceTable,
          targetTable: targetConfig.table,
          skipped: true,
          reason: !sourceExists
            ? 'source table missing'
            : 'target table missing',
        });
        continue;
      }

      const sourceRows = await loadSourceRows(client, config, limit);
      const rows = buildRows(domain, sourceRows, config);
      const validationErrors = validateRows(domain, rows);
      const missingUsers = await unresolvedUsers(client, rows);
      const existing = await countExisting(client, domain, rows);
      const domainReport = {
        domain,
        sourceTable: config.sourceTable,
        targetTable: targetConfig.table,
        sourceRows: sourceRows.length,
        candidateRows: rows.length,
        existingRows: existing,
        validationErrors: validationErrors.slice(0, 25),
        validationErrorCount: validationErrors.length,
        unresolvedUserIds: missingUsers.slice(0, 25),
        unresolvedUserCount: missingUsers.length,
        insertedRows: 0,
      };

      if (apply && validationErrors.length === 0 && missingUsers.length === 0) {
        domainReport.insertedRows = await insertRows(client, domain, rows);
      }
      report.domains.push(domainReport);
    }

    if (apply) {
      await client.query('COMMIT');
      report.applied = true;
    }
  } catch (error) {
    if (apply) await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  return report;
}

if (require.main === module) {
  restore(parseArgs(process.argv))
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`Legacy data restore failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  TARGETS,
  buildRows,
  loadMapping,
  normalizeAmount,
  normalizeCurrency,
  parseArgs,
  restore,
  validateRows,
};
