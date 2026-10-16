'use strict';

const { quoteIdentifier: quote, sslConfiguration } = require('./audit-legacy-data');

const operationFields = {
  type: 'varchar', providerReference: 'varchar', errorCode: 'varchar',
};
const profileFields = {
  id: 'uuid', createdAt: 'timestamp without time zone', updatedAt: 'timestamp without time zone',
  deletedAt: 'timestamp without time zone', userId: 'uuid', region: 'character varying',
  provider: 'character varying', status: 'character varying', statusMessage: 'character varying',
  rejectionReason: 'character varying', providerReference: 'character varying', sections: 'text',
  uploads: 'text', identity: 'text', capabilities: 'text', limits: 'text',
};
const legacyStatusMapping = Object.freeze({
  NOT_STARTED: 'NOT_STARTED', VERIFIED: 'VERIFIED',
  PENDING_REVIEW: 'MANUAL_REVIEW', REJECTED: 'REJECTED',
});

function legacyCandidates(hasLegacy, hasProfiles) {
  return `SELECT u.id, u."kycStatus"::text AS "userStatus",
    ${hasLegacy ? 'k.id' : 'NULL::uuid'} AS "legacyId",
    ${hasLegacy ? 'k.status::text' : 'NULL::text'} AS "legacyStatus"
    FROM public."user" u
    ${hasLegacy ? 'LEFT JOIN public.user_kyc k ON k."userId" = u.id AND k."deletedAt" IS NULL' : ''}
    WHERE u."deletedAt" IS NULL
    ${hasProfiles ? 'AND NOT EXISTS (SELECT 1 FROM public.kyc_profile p WHERE p."userId" = u.id)' : ''}`;
}

function mappedLegacyStatus(row) {
  const userStatus = row.userStatus ?? 'NOT_STARTED';
  const legacyStatus = row.legacyStatus ?? 'NOT_STARTED';
  if (userStatus !== legacyStatus || !Object.hasOwn(legacyStatusMapping, userStatus)) return null;
  return legacyStatusMapping[userStatus];
}

async function columns(client, table) {
  const result = await client.query(`SELECT column_name, data_type, is_nullable, column_default,
    is_identity, is_generated FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.map((row) => [row.column_name, row]));
}

function requireFields(map, table, fields) {
  for (const [name, allowed] of Object.entries(fields)) {
    const column = map.get(name);
    if (!column || !allowed.includes(column.data_type)) {
      throw new Error(`Unexpected or missing ${table}.${name}; a separate schema mapping is required.`);
    }
  }
}

async function uniqueIndexExists(client, table, names) {
  const result = await client.query(`SELECT array_agg(a.attname::text ORDER BY k.ordinality) AS columns
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public' AND t.relname = $1 AND i.indisunique AND i.indisvalid
      AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnatts = i.indnkeyatts
    GROUP BY i.indexrelid`, [table]);
  return result.rows.some((row) => JSON.stringify(row.columns) === JSON.stringify(names));
}

async function inspectKycStorage(client, { mapLegacyKyc = false } = {}) {
  const operations = await columns(client, 'provider_operation');
  const users = await columns(client, 'user');
  const legacy = await columns(client, 'user_kyc');
  const profiles = await columns(client, 'kyc_profile');
  const text = ['character varying', 'text'];
  const textOrEnum = [...text, 'USER-DEFINED'];
  requireFields(operations, 'provider_operation', {
    id: ['uuid'], createdAt: ['timestamp without time zone'], updatedAt: ['timestamp without time zone'],
    deletedAt: ['timestamp without time zone'], userId: ['uuid'], provider: textOrEnum,
    status: textOrEnum, currency: textOrEnum, reference: text, idempotencyKey: text,
    amount: ['numeric'], requestPayload: ['text'], responsePayload: ['text'], metadata: ['text'], failureReason: text,
  });
  requireFields(users, 'user', { id: ['uuid'], deletedAt: ['timestamp without time zone'], kycStatus: textOrEnum });
  if (!operations.has('type') && !operations.has('operationType')) {
    throw new Error('provider_operation has no reviewed source for type; refusing to invent operation types.');
  }
  if (operations.has('operationType')) requireFields(operations, 'provider_operation', { operationType: textOrEnum });
  for (const field of Object.keys(operationFields)) {
    if (operations.has(field)) requireFields(operations, 'provider_operation', { [field]: text });
  }
  const written = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'userId', 'type', 'idempotencyKey',
    'reference', 'status', 'amount', 'currency', 'provider', 'providerReference', 'requestPayload',
    'responsePayload', 'errorCode', 'failureReason', 'metadata', 'operationType']);
  const blockers = [];
  for (const field of ['id', 'createdAt', 'updatedAt']) {
    if (operations.get(field).column_default == null) blockers.push(`provider_operation.${field} needs its reviewed database default`);
  }
  if (!(await client.query("SELECT to_regprocedure('gen_random_uuid()') IS NOT NULL AS available")).rows[0].available) {
    blockers.push('gen_random_uuid() is required for new KYC profile IDs');
  }
  for (const column of operations.values()) {
    if (!written.has(column.column_name) && column.is_nullable === 'NO' && column.column_default == null &&
        column.is_identity !== 'YES' && column.is_generated !== 'ALWAYS') {
      blockers.push(`Unmapped required provider_operation.${column.column_name}`);
    }
  }
  if (profiles.size) {
    requireFields(profiles, 'kyc_profile', Object.fromEntries(Object.entries(profileFields).map(([key, type]) => [key, [type]])));
    if (!(await uniqueIndexExists(client, 'kyc_profile', ['userId']))) blockers.push('kyc_profile requires a unique userId index');
  }
  if (legacy.size) {
    requireFields(legacy, 'user_kyc', { id: ['uuid'], userId: ['uuid'], status: textOrEnum, deletedAt: ['timestamp without time zone'] });
  }
  const effectiveType = operations.has('type')
    ? (operations.has('operationType') ? 'COALESCE("type", "operationType"::text)' : '"type"')
    : '"operationType"::text';
  const counts = await client.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE ${effectiveType} IS NULL)::int AS unmapped
    FROM public.provider_operation`);
  if (counts.rows[0].unmapped) blockers.push('Existing provider operations have no type; explicit mapping required');
  const duplicates = await client.query(`SELECT
    (SELECT count(*)::int FROM (SELECT reference FROM public.provider_operation WHERE reference IS NOT NULL
      GROUP BY reference HAVING count(*) > 1) d) AS references,
    (SELECT count(*)::int FROM (SELECT "userId", ${effectiveType}, "idempotencyKey"
      FROM public.provider_operation WHERE "userId" IS NOT NULL AND "idempotencyKey" IS NOT NULL
        AND ${effectiveType} IS NOT NULL GROUP BY "userId", ${effectiveType}, "idempotencyKey"
      HAVING count(*) > 1) d) AS idempotency`);
  if (duplicates.rows[0].references || duplicates.rows[0].idempotency) blockers.push('Duplicate operation references/idempotency keys require review; records will not be deleted');

  // Compare each user's two sources; matching aggregate counts can hide conflicting decisions.
  const unprofiled = profiles.size ? 'AND NOT EXISTS (SELECT 1 FROM public.kyc_profile p WHERE p."userId" = u.id)' : '';
  const userStates = await client.query(`SELECT u."kycStatus"::text AS status, count(*)::int AS count
    FROM public."user" u WHERE u."deletedAt" IS NULL ${unprofiled} GROUP BY u."kycStatus"::text`);
  const legacyStates = legacy.size ? await client.query(`SELECT k.status::text AS status, count(*)::int AS count
    FROM public.user_kyc k JOIN public."user" u ON u.id = k."userId"
    WHERE u."deletedAt" IS NULL AND k."deletedAt" IS NULL ${unprofiled} GROUP BY k.status::text`) : { rows: [] };
  const candidates = (await client.query(legacyCandidates(legacy.size, profiles.size))).rows;
  const mappingCounts = new Map();
  let unmapped = 0;
  for (const row of candidates) {
    const target = mappedLegacyStatus(row);
    if (!target) { unmapped++; continue; }
    const source = row.userStatus ?? 'NOT_STARTED';
    const key = JSON.stringify([source, target]);
    mappingCounts.set(key, (mappingCounts.get(key) || 0) + 1);
  }
  if (unmapped) blockers.push(`${unmapped} legacy KYC records have conflicting, missing decision sources, or unsupported statuses; review per user`);
  let evidenceRows = 0;
  if (legacy.size) {
    const duplicateKyc = await client.query(`SELECT count(*)::int AS count FROM
      (SELECT "userId" FROM public.user_kyc WHERE "deletedAt" IS NULL GROUP BY "userId" HAVING count(*) > 1) d`);
    if (duplicateKyc.rows[0].count) blockers.push('Multiple active legacy KYC rows per user require review');
    const evidence = await client.query(`SELECT count(*)::int AS count FROM public.user_kyc k
      JOIN public."user" u ON u.id = k."userId" WHERE u."deletedAt" IS NULL AND k."deletedAt" IS NULL ${unprofiled}
      AND EXISTS (SELECT 1 FROM jsonb_each(to_jsonb(k)) e WHERE e.key IN
        ('identityData', 'addressData', 'livenessData', 'submissionReference', 'providerResponse', 'submittedAt', 'reviewedAt')
        AND e.value NOT IN ('null'::jsonb, '""'::jsonb, '"{}"'::jsonb, '"[]"'::jsonb, '{}'::jsonb, '[]'::jsonb))`);
    evidenceRows = evidence.rows[0].count;
  }
  const requiresLegacyMapping = evidenceRows > 0 || candidates.some((row) =>
    (row.userStatus != null && row.userStatus !== 'NOT_STARTED') ||
    (row.legacyStatus != null && row.legacyStatus !== 'NOT_STARTED'));
  if (requiresLegacyMapping && !mapLegacyKyc) {
    blockers.push('Legacy KYC history requires review of proposedLegacyMappings and explicit --map-legacy-kyc');
  }
  const missingFields = Object.keys(operationFields).filter((key) => !operations.has(key));
  const enumConversions = ['provider', 'status', 'currency'].filter((key) => operations.get(key).data_type === 'USER-DEFINED');
  if (users.get('kycStatus').data_type === 'USER-DEFINED') enumConversions.push('user.kycStatus');
  const legacyRequired = operations.get('operationType')?.is_nullable === 'NO' || operations.get('operationType')?.column_default != null;
  const missingIndexes = [];
  for (const fields of [['reference'], ['userId', 'type', 'idempotencyKey']]) {
    if (!(await uniqueIndexExists(client, 'provider_operation', fields))) missingIndexes.push(fields);
  }
  const needsBackfill = operations.has('operationType') && operations.has('type')
    ? Number((await client.query('SELECT count(*)::int AS count FROM public.provider_operation WHERE "type" IS NULL AND "operationType" IS NOT NULL')).rows[0].count)
    : (!operations.has('type') ? counts.rows[0].total : 0);
  return {
    applied: false, blockers, operationRows: counts.rows[0].total, missingFields, enumConversions,
    relaxLegacyOperationType: Boolean(legacyRequired), missingIndexes, typeRowsToBackfill: needsBackfill,
    createKycProfile: !profiles.size, profilesToSeed: userStates.rows.reduce((sum, row) => sum + row.count, 0),
    legacyUserStatuses: userStates.rows, legacyKycStatuses: legacyStates.rows,
    proposedLegacyMappings: [...mappingCounts].map(([key, count]) => {
      const [source, target] = JSON.parse(key);
      return { source, target, count };
    }).sort((a, b) => a.source.localeCompare(b.source)),
    legacyEvidenceRows: evidenceRows, unmappedLegacyRows: unmapped,
    transactionHistory: (await columns(client, 'financial_transaction')).size ? 'PRESENT_NOT_AUDITED' : 'MISSING_REQUIRES_SEPARATE_LEGACY_MAPPING',
  };
}

function hasChanges(plan) {
  return plan.missingFields.length || plan.enumConversions.length || plan.relaxLegacyOperationType ||
    plan.missingIndexes.length || plan.typeRowsToBackfill || plan.createKycProfile || plan.profilesToSeed;
}

async function convertEnumColumn(client, table, field) {
  const name = `public.${quote(table)}`;
  const before = (await columns(client, table)).get(field);
  if (before.data_type !== 'USER-DEFINED') return;
  // Existing values and the old default are cast to text without renaming statuses/providers.
  await client.query(`ALTER TABLE ${name} ALTER COLUMN ${quote(field)} DROP DEFAULT`);
  await client.query(`ALTER TABLE ${name} ALTER COLUMN ${quote(field)} TYPE varchar USING ${quote(field)}::text`);
  if (before.column_default != null) {
    await client.query(`ALTER TABLE ${name} ALTER COLUMN ${quote(field)} SET DEFAULT (${before.column_default})::text`);
  }
}

async function repairKycStorage(client, apply = false, options = {}) {
  let plan = await inspectKycStorage(client, options);
  if (!apply || !hasChanges(plan)) return plan;
  if (plan.blockers.length) throw new Error(`No repair applied: ${plan.blockers.join('; ')}`);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(721904, 3)");
    await client.query('LOCK TABLE public."user", public.provider_operation IN ACCESS EXCLUSIVE MODE');
    if ((await columns(client, 'user_kyc')).size) await client.query('LOCK TABLE public.user_kyc IN SHARE MODE');
    if ((await columns(client, 'kyc_profile')).size) await client.query('LOCK TABLE public.kyc_profile IN ACCESS EXCLUSIVE MODE');
    plan = await inspectKycStorage(client, options);
    if (plan.blockers.length) throw new Error(`No repair applied: ${plan.blockers.join('; ')}`);
    for (const field of plan.missingFields) {
      await client.query(`ALTER TABLE public.provider_operation ADD COLUMN ${quote(field)} ${operationFields[field]} NULL`);
    }
    for (const field of plan.enumConversions) {
      await convertEnumColumn(client, field === 'user.kycStatus' ? 'user' : 'provider_operation', field === 'user.kycStatus' ? 'kycStatus' : field);
    }
    if (plan.typeRowsToBackfill) {
      await client.query('UPDATE public.provider_operation SET "type" = "operationType"::text WHERE "type" IS NULL');
    }
    if (plan.relaxLegacyOperationType) {
      await client.query('ALTER TABLE public.provider_operation ALTER COLUMN "operationType" DROP NOT NULL, ALTER COLUMN "operationType" DROP DEFAULT');
    }
    for (const fields of plan.missingIndexes) {
      const name = fields.length === 1 ? 'UQ_vidalpay_operation_reference' : 'UQ_vidalpay_operation_idempotency';
      await client.query(`CREATE UNIQUE INDEX ${quote(name)} ON public.provider_operation (${fields.map(quote).join(', ')})`);
    }
    if (plan.createKycProfile) {
      await client.query(`CREATE TABLE public.kyc_profile (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(), "deletedAt" timestamp NULL,
        "userId" uuid NOT NULL UNIQUE REFERENCES public."user"(id), region varchar NULL, provider varchar NULL,
        status varchar NOT NULL DEFAULT 'NOT_STARTED', "statusMessage" varchar NULL, "rejectionReason" varchar NULL,
        "providerReference" varchar NULL, sections text NULL, uploads text NULL, identity text NULL,
        capabilities text NULL, limits text NULL)`);
    }
    if (plan.profilesToSeed) {
      const legacy = await columns(client, 'user_kyc');
      const users = await columns(client, 'user');
      const regionField = users.has('region') ? 'u.region' : users.has('countryCode') ? 'u."countryCode"' : 'NULL::text';
      const candidates = (await client.query(legacyCandidates(legacy.size, true))).rows;
      let seeded = 0;
      for (const row of candidates) {
        const status = mappedLegacyStatus(row);
        if (!status) throw new Error('Legacy KYC mapping changed; repair rolled back.');
        // identity is returned to mobile. Keep only provenance here, never raw legacy evidence.
        const identity = JSON.stringify({ legacySource: {
          mappingVersion: 1, table: row.legacyId ? 'user_kyc' : 'user',
          id: row.legacyId ?? row.id, status: row.legacyStatus,
          userStatus: row.userStatus, mappedStatus: status,
        } });
        const inserted = await client.query(`INSERT INTO public.kyc_profile ("userId", region, status, identity)
          SELECT u.id, CASE WHEN ${regionField} IN ('NG', 'US') THEN ${regionField} ELSE NULL END, $2, $3
          FROM public."user" u WHERE u.id = $1 RETURNING status`, [row.id, status, identity]);
        if (inserted.rowCount !== 1 || inserted.rows[0].status !== status) {
          throw new Error('Legacy KYC profile verification failed; repair rolled back.');
        }
        seeded++;
      }
      if (seeded !== plan.profilesToSeed) throw new Error('Legacy KYC profile count changed; repair rolled back.');
    }
    const verified = await inspectKycStorage(client, options);
    if (hasChanges(verified) || verified.blockers.length || verified.operationRows !== plan.operationRows) {
      throw new Error('KYC storage verification failed; repair rolled back.');
    }
    await client.query('COMMIT');
    return { ...verified, applied: true, appliedLegacyMappings: plan.proposedLegacyMappings };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Recheck after a connection failure. */ }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some((arg) => !['--check', '--apply', '--map-legacy-kyc'].includes(arg)) ||
      (args.includes('--check') && args.includes('--apply'))) {
    throw new Error('Use --check (default) or --apply, optionally with --map-legacy-kyc after reviewing the proposed mapping.');
  }
  if (!/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || '')) throw new Error('A PostgreSQL DATABASE_URL is required.');
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfiguration(process.env.DB_SSL), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const result = await repairKycStorage(client, args.includes('--apply'), { mapLegacyKyc: args.includes('--map-legacy-kyc') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.blockers.length || hasChanges(result)) process.exitCode = 2;
  } finally { await client.end(); }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`KYC storage repair failed${error.code ? ` (${error.code})` : ''}. ${error.code ? 'Check database privileges/schema and rerun --check before retrying.' : error.message}\n`);
  process.exitCode = 1;
});

module.exports = { inspectKycStorage, repairKycStorage, hasChanges };
