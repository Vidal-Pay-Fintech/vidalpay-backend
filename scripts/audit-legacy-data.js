'use strict';

const FINANCIAL_TABLE_PATTERN =
  /(user|wallet|account|transaction|beneficiar|notification|kyc|verification|reward|referral|card|transfer|operation|ledger|journal)/i;

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sslConfiguration(value) {
  if (!value) return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['false', '0', 'off', 'disable'].includes(normalized)) return false;
  return { rejectUnauthorized: false };
}

async function audit() {
  const { Client } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required. No database connection was attempted.');
  }

  const client = new Client({
    connectionString,
    ssl: sslConfiguration(process.env.DB_SSL),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  });

  await client.connect();
  try {
    const [{ rows: tableRows }, { rows: columnRows }, { rows: indexRows }] =
      await Promise.all([
        client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `),
        client.query(`
          SELECT table_name, column_name, data_type, udt_name, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `),
        client.query(`
          SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
          FROM pg_indexes
          WHERE schemaname = 'public'
          ORDER BY tablename, indexname
        `),
      ]);

    const tables = [];
    for (const { table_name: tableName } of tableRows) {
      const countResult = await client.query(
        `SELECT COUNT(*)::text AS row_count FROM ${quoteIdentifier(tableName)}`,
      );
      tables.push({
        table: tableName,
        relevantToRestore: FINANCIAL_TABLE_PATTERN.test(tableName),
        rowCount: countResult.rows[0].row_count,
        columns: columnRows
          .filter((column) => column.table_name === tableName)
          .map(({ column_name, data_type, udt_name, is_nullable }) => ({
            name: column_name,
            type: data_type,
            databaseType: udt_name,
            nullable: is_nullable === 'YES',
          })),
        indexes: indexRows
          .filter((index) => index.table_name === tableName)
          .map(({ index_name, definition }) => ({ name: index_name, definition })),
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          readOnly: true,
          includesCustomerValues: false,
          tables,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  audit().catch((error) => {
    process.stderr.write(`Legacy data audit failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { audit, quoteIdentifier, sslConfiguration };
