# Legacy data restore procedure

This procedure is designed for the existing production PostgreSQL database. It does not change database configuration, run migrations, or write customer data.

## 1. Inventory the database

Run this from a Render shell where `DATABASE_URL`, `DB_SSL`, and `DB_CONNECT_TIMEOUT_MS` are already configured:

```sh
npm run db:audit-legacy > legacy-data-audit.json
```

The report contains public table names, columns, indexes, and row counts. It does not select customer field values and does not print the connection URL.

Keep the report private because schema details and record counts are operational information.

## 2. Map legacy data

Generate a read-only candidate mapping from the audit:

```sh
npm run db:plan-legacy-restore -- legacy-data-audit.json > legacy-restore-plan.json
```

The plan groups likely source tables for users, wallets, transactions, beneficiaries, notifications, KYC, rewards, and activity. It does not read customer values and does not merge records.

Use the inventory to identify the actual source tables for users, wallets, transactions, beneficiaries, notifications, KYC, rewards, and referrals. Map each source column to the current table only after checking:

- user and wallet foreign keys;
- currency and amount precision;
- provider and transaction references;
- timestamps and statuses;
- primary keys and unique constraints;
- whether records already exist in the current table.

## 3. Prepare a dry run

The merge script must default to dry-run mode and report source rows, insertable rows, duplicates, unresolved users or wallets, currency conflicts, and invalid references. It must not overwrite a current record when an identifier or provider reference conflicts.

Create a reviewed mapping file from the template:

```sh
cp docs/legacy-restore-mapping.example.json legacy-restore-mapping.json
```

Edit `legacy-restore-mapping.json` so each `sourceTable` and `columnMap` matches the actual tables shown in `legacy-restore-plan.json`.

Run a dry-run restore report:

```sh
npm run db:restore-legacy -- --mapping legacy-restore-mapping.json > legacy-restore-dry-run.json
```

The dry run reports source rows, candidate rows, already-existing rows, validation errors, and unresolved user IDs. It does not write data.

## 4. Apply safely

Before applying the reviewed mapping, create a Render PostgreSQL backup or recovery point. Execute the merge in one database transaction with an advisory lock and idempotent conflict handling. Preserve legacy identifiers and source-table provenance where the current schema permits it.

After the dry run has no validation errors and no unresolved users, apply the restore:

```sh
npm run db:restore-legacy -- --mapping legacy-restore-mapping.json --apply > legacy-restore-apply.json
```

The apply mode inserts history records with `ON CONFLICT DO NOTHING`. It does not recompute wallet balances or overwrite existing current records.

## 5. Reconcile

Compare source and destination record counts, transaction totals grouped by currency and status, orphan counts, and a small authorized sample of user histories. Application reads should be verified for both NGN and USD wallets before declaring the restore complete.

Do not run a generic merge before the inventory has established the real source table and column names.
