'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectKycStorage, repairKycStorage } = require('./repair-kyc-storage');
const connectionString = process.env.VIDALPAY_KYC_TEST_URL;

test('KYC compatibility repair on disposable PostgreSQL', { skip: !connectionString }, async (t) => {
  const target = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.match(target.pathname, /^\/vidalpay_repair_test_[a-z0-9_]+$/);
  const { Client } = require('pg');
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  const userId = '00000000-0000-4000-8000-000000000001';
  try {
    const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(existing.rows.length, 0, 'Refusing a database containing existing tables');
    const fixture = async () => {
      // The loopback-only, initially empty database above belongs exclusively to this test.
      await client.query('DROP SCHEMA public CASCADE');
      await client.query('CREATE SCHEMA public');
      await client.query(`CREATE TYPE provider_enum AS ENUM ('FINCRA', 'PAYVESSEL');
        CREATE TYPE operation_enum AS ENUM ('VIRTUAL_ACCOUNT', 'PAYOUT');
        CREATE TYPE status_enum AS ENUM ('PENDING', 'SUCCESS');
        CREATE TYPE currency_enum AS ENUM ('NGN', 'USD');
        CREATE TYPE kyc_enum AS ENUM ('NOT_STARTED', 'VERIFIED', 'PENDING_REVIEW', 'REJECTED', 'UNKNOWN');
        CREATE TABLE public."user" (id uuid PRIMARY KEY, "deletedAt" timestamp NULL,
          region varchar, "kycStatus" kyc_enum NOT NULL DEFAULT 'NOT_STARTED');
        CREATE TABLE public.user_kyc (id uuid PRIMARY KEY, "userId" uuid UNIQUE,
          "deletedAt" timestamp NULL, status kyc_enum NOT NULL DEFAULT 'NOT_STARTED', "identityData" text);
        CREATE TABLE public.provider_operation (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "createdAt" timestamp NOT NULL DEFAULT now(),
          "updatedAt" timestamp NOT NULL DEFAULT now(), "deletedAt" timestamp NULL, "userId" uuid,
          "walletId" uuid, provider provider_enum NOT NULL, "regionCode" varchar,
          "operationType" operation_enum NOT NULL, status status_enum NOT NULL DEFAULT 'PENDING',
          reference varchar, "externalReference" varchar, "internalReference" varchar, "transactionId" uuid,
          currency currency_enum, amount numeric, "requestPayload" text, "responsePayload" text,
          metadata text, "failureReason" text, "reconciliationStatus" varchar, "lastWebhookEventId" uuid,
          "reconciledAt" timestamp, "idempotencyKey" varchar, "requestHash" varchar, "moneyEventId" uuid
        );`);
      await client.query('INSERT INTO public."user" (id, region) VALUES ($1, $2)', [userId, 'NG']);
      await client.query('INSERT INTO public.user_kyc (id, "userId") VALUES (gen_random_uuid(), $1)', [userId]);
      await client.query(`INSERT INTO public.provider_operation ("userId", provider, "operationType", status,
        reference, currency, amount, metadata, "idempotencyKey")
        SELECT $1::uuid, 'FINCRA', 'VIRTUAL_ACCOUNT', 'SUCCESS', 'legacy-' || n, 'NGN', 123.456789,
          '{"legacy":true}', 'key-' || n FROM generate_series(1,20) n`, [userId]);
    };

    await t.test('check describes the supplied 20-row schema and performs no writes', async () => {
      await fixture();
      await client.query('BEGIN READ ONLY');
      try {
        const result = await inspectKycStorage(client);
        assert.equal(result.operationRows, 20);
        assert.deepEqual(result.missingFields, ['type', 'providerReference', 'errorCode']);
        assert.deepEqual(result.blockers, []);
        assert.equal(result.createKycProfile, true);
        assert.equal(result.profilesToSeed, 1);
        assert.match(result.transactionHistory, /^MISSING/);
      } finally { await client.query('ROLLBACK'); }
    });

    await t.test('repair preserves every original column/value and legacy KYC while enabling new writes', async () => {
      await fixture();
      const before = (await client.query('SELECT to_jsonb(o) AS row FROM public.provider_operation o ORDER BY id')).rows;
      const legacy = (await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k')).rows;
      assert.equal((await repairKycStorage(client, true)).applied, true);
      const after = (await client.query(`SELECT to_jsonb(o) - ARRAY['type', 'providerReference', 'errorCode'] AS row
        FROM public.provider_operation o ORDER BY id`)).rows;
      assert.deepEqual(after, before);
      assert.deepEqual((await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k')).rows, legacy);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.provider_operation WHERE "type" = "operationType"::text')).rows[0].count, 20);
      const profile = (await client.query('SELECT status, provider, identity::json FROM public.kyc_profile')).rows[0];
      assert.equal(profile.status, 'NOT_STARTED');
      assert.equal(profile.provider, null);
      assert.equal(profile.identity.legacySource.table, 'user_kyc');
      assert.equal((await repairKycStorage(client, true)).applied, false);

      await client.query(`INSERT INTO public.provider_operation ("userId", type, provider, status, reference, "idempotencyKey")
        VALUES ($1, 'kyc_fincra_bvn', 'Fincra', 'VERIFIED', 'new-check', 'new-check')`, [userId]);
      await client.query(`UPDATE public."user" SET "kycStatus" = 'IN_PROGRESS' WHERE id = $1`, [userId]);
      await client.query(`UPDATE public.kyc_profile SET status = 'IN_PROGRESS', provider = 'FINCRA' WHERE "userId" = $1`, [userId]);
      assert.equal((await client.query(`SELECT count(*)::int AS count FROM public.provider_operation
        WHERE "userId" = $1 AND type = 'kyc_fincra_bvn' AND provider = 'Fincra'`, [userId])).rows[0].count, 1);
      await assert.rejects(client.query(`INSERT INTO public.provider_operation
        ("userId", type, provider, reference, "idempotencyKey") VALUES ($1, 'kyc_fincra_bvn', 'Fincra', 'another-ref', 'new-check')`,
      [userId]), { code: '23505' });
      assert.equal((await client.query("SELECT to_regclass('public.financial_transaction') AS table")).rows[0].table, null);
    });

    await t.test('a failure after ALTER and backfill rolls back schema and data', async () => {
      await fixture();
      const before = (await client.query('SELECT to_jsonb(o) AS row FROM public.provider_operation o ORDER BY id')).rows;
      const failingClient = { query: async (sql, args) => {
        if (sql.startsWith('CREATE TABLE public.kyc_profile')) throw new Error('injected failure');
        return client.query(sql, args);
      } };
      await assert.rejects(repairKycStorage(failingClient, true), /injected failure/);
      assert.deepEqual((await client.query('SELECT to_jsonb(o) AS row FROM public.provider_operation o ORDER BY id')).rows, before);
      assert.deepEqual((await inspectKycStorage(client)).missingFields, ['type', 'providerReference', 'errorCode']);
    });

    await t.test('duplicate financial references stop the repair without deleting rows', async () => {
      await fixture();
      await client.query("UPDATE public.provider_operation SET reference = 'duplicate'");
      await assert.rejects(repairKycStorage(client, true), /Duplicate operation references/);
      assert.equal((await inspectKycStorage(client)).operationRows, 20);
    });

    await t.test('conflicting approval is blocked even with explicit mapping', async () => {
      await fixture();
      await client.query("UPDATE public.user_kyc SET status = 'VERIFIED'");
      await assert.rejects(repairKycStorage(client, true, { mapLegacyKyc: true }), /conflicting/);
      assert.equal((await client.query('SELECT status FROM public.user_kyc')).rows[0].status, 'VERIFIED');
      assert.equal((await client.query("SELECT to_regclass('public.kyc_profile') AS table")).rows[0].table, null);
    });

    await t.test('legacy evidence requires opt-in and remains private in its original table', async () => {
      await fixture();
      await client.query('UPDATE public.user_kyc SET "identityData" = $1', ['{"identity":"test-only"}']);
      await assert.rejects(repairKycStorage(client, true), /explicit --map-legacy-kyc/);
      const before = (await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k')).rows;
      const plan = await inspectKycStorage(client, { mapLegacyKyc: true });
      assert.deepEqual(plan.blockers, []);
      assert.equal(plan.legacyEvidenceRows, 1);
      assert.equal(JSON.stringify(plan).includes('test-only'), false);
      await repairKycStorage(client, true, { mapLegacyKyc: true });
      assert.deepEqual((await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k')).rows, before);
      const profile = (await client.query('SELECT * FROM public.kyc_profile')).rows[0];
      assert.equal(profile.status, 'NOT_STARTED');
      assert.equal(JSON.stringify(profile).includes('test-only'), false);
      assert.equal(JSON.parse(profile.identity).legacySource.id, before[0].row.id);
    });

    await t.test('maps the supplied 11-user distribution without new provider approvals or overwriting profiles', async () => {
      await fixture();
      const states = ['NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED',
        'VERIFIED', 'PENDING_REVIEW', 'PENDING_REVIEW', 'PENDING_REVIEW', 'PENDING_REVIEW', 'REJECTED'];
      for (let i = 1; i < states.length; i++) {
        const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
        await client.query('INSERT INTO public."user" (id, region, "kycStatus") VALUES ($1, $2, $3)', [id, 'NG', states[i]]);
        await client.query(`INSERT INTO public.user_kyc (id, "userId", status, "identityData")
          VALUES (gen_random_uuid(), $1, $2, $3)`, [id, states[i], '{"sensitive":"retained-test-evidence"}']);
      }
      const usersBefore = (await client.query('SELECT to_jsonb(u) AS row FROM public."user" u ORDER BY id')).rows;
      const legacyBefore = (await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k ORDER BY id')).rows;
      const plan = await inspectKycStorage(client, { mapLegacyKyc: true });
      assert.equal(plan.profilesToSeed, 11);
      assert.deepEqual(plan.blockers, []);
      assert.deepEqual(plan.proposedLegacyMappings, [
        { source: 'NOT_STARTED', target: 'NOT_STARTED', count: 5 },
        { source: 'PENDING_REVIEW', target: 'MANUAL_REVIEW', count: 4 },
        { source: 'REJECTED', target: 'REJECTED', count: 1 },
        { source: 'VERIFIED', target: 'VERIFIED', count: 1 },
      ]);
      await assert.rejects(repairKycStorage(client, true), /explicit --map-legacy-kyc/);
      const result = await repairKycStorage(client, true, { mapLegacyKyc: true });
      assert.deepEqual(result.appliedLegacyMappings, plan.proposedLegacyMappings);
      assert.deepEqual((await client.query('SELECT to_jsonb(u) AS row FROM public."user" u ORDER BY id')).rows, usersBefore);
      assert.deepEqual((await client.query('SELECT to_jsonb(k) AS row FROM public.user_kyc k ORDER BY id')).rows, legacyBefore);
      const profiles = (await client.query('SELECT * FROM public.kyc_profile ORDER BY "userId"')).rows;
      assert.deepEqual(profiles.map((p) => p.status), states.map((s) => s === 'PENDING_REVIEW' ? 'MANUAL_REVIEW' : s));
      assert.ok(profiles.every((p) => p.provider === null && p.providerReference === null && p.sections === null));
      assert.equal(JSON.stringify(profiles).includes('retained-test-evidence'), false);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.provider_operation')).rows[0].count, 20);
      await client.query(`UPDATE public.kyc_profile SET status = 'RETRY_REQUIRED' WHERE "userId" = $1`, [userId]);
      const updatedProfiles = (await client.query('SELECT * FROM public.kyc_profile ORDER BY "userId"')).rows;
      assert.equal((await repairKycStorage(client, true, { mapLegacyKyc: true })).applied, false);
      assert.deepEqual((await client.query('SELECT * FROM public.kyc_profile ORDER BY "userId"')).rows, updatedProfiles);
    });

    await t.test('matching aggregate totals cannot hide per-user conflicting decisions', async () => {
      await fixture();
      const other = '00000000-0000-4000-8000-000000000002';
      await client.query(`INSERT INTO public."user" (id, "kycStatus") VALUES ($1, 'VERIFIED')`, [other]);
      await client.query(`INSERT INTO public.user_kyc (id, "userId") VALUES (gen_random_uuid(), $1)`, [other]);
      await client.query(`UPDATE public.user_kyc SET status = 'VERIFIED' WHERE "userId" = $1`, [userId]);
      const plan = await inspectKycStorage(client, { mapLegacyKyc: true });
      const sorted = (rows) => [...rows].sort((a, b) => a.status.localeCompare(b.status));
      assert.deepEqual(sorted(plan.legacyUserStatuses), sorted(plan.legacyKycStatuses));
      assert.equal(plan.unmappedLegacyRows, 2);
      await assert.rejects(repairKycStorage(client, true, { mapLegacyKyc: true }), /conflicting/);
    });

    await t.test('missing approval source and unknown matched statuses both block mapping', async () => {
      await fixture();
      await client.query(`UPDATE public."user" SET "kycStatus" = 'VERIFIED'`);
      await client.query('DELETE FROM public.user_kyc');
      await assert.rejects(repairKycStorage(client, true, { mapLegacyKyc: true }), /missing decision sources/);
      await fixture();
      await client.query(`UPDATE public."user" SET "kycStatus" = 'UNKNOWN'`);
      await client.query(`UPDATE public.user_kyc SET status = 'UNKNOWN'`);
      await assert.rejects(repairKycStorage(client, true, { mapLegacyKyc: true }), /unsupported statuses/);
    });

    await t.test('failure during mapped profile insertion rolls back all preceding changes', async () => {
      await fixture();
      await client.query(`UPDATE public."user" SET "kycStatus" = 'VERIFIED'`);
      await client.query(`UPDATE public.user_kyc SET status = 'VERIFIED'`);
      const failingClient = { query: async (sql, args) => {
        const result = await client.query(sql, args);
        if (sql.startsWith('INSERT INTO public.kyc_profile')) throw new Error('injected mapping failure');
        return result;
      } };
      await assert.rejects(repairKycStorage(failingClient, true, { mapLegacyKyc: true }), /injected mapping failure/);
      assert.equal((await client.query("SELECT to_regclass('public.kyc_profile') AS table")).rows[0].table, null);
      assert.equal((await client.query('SELECT "kycStatus" FROM public."user"')).rows[0].kycStatus, 'VERIFIED');
      assert.deepEqual((await inspectKycStorage(client)).missingFields, ['type', 'providerReference', 'errorCode']);
    });

    await t.test('unexpected required legacy columns block writes', async () => {
      await fixture();
      await client.query("ALTER TABLE public.provider_operation ADD COLUMN unsupported text NOT NULL DEFAULT 'legacy'");
      await client.query('ALTER TABLE public.provider_operation ALTER COLUMN unsupported DROP DEFAULT');
      await assert.rejects(repairKycStorage(client, true), /Unmapped required/);
    });

    await t.test('missing generated-ID default blocks a repair that would still fail inserts', async () => {
      await fixture();
      await client.query('ALTER TABLE public.provider_operation ALTER COLUMN id DROP DEFAULT');
      await assert.rejects(repairKycStorage(client, true), /provider_operation.id needs/);
    });
  } finally { await client.end(); }
});
