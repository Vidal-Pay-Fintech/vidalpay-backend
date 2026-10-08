# Vidal Pay read-only production inventory and restore design

Status: production database access was not available in this local shell. `DATABASE_URL`, `DB_SSL`, and `DB_CONNECT_TIMEOUT_MS` were not set when checked. No production connection was attempted and no production records were read or modified.

This document records the safe next step, the current repository-derived design, and the exact read-only operator command required to complete the production inventory.

## A. Production schema inventory

Live production inventory is pending an authorized read-only run. Use only this command from an environment that has the Render PostgreSQL variables configured:

```bash
node scripts/readonly-production-inventory.js --output production-readonly-inventory.json
```

The script opens `BEGIN READ ONLY`, sets local timeout limits, and executes only `SELECT` queries after validating query text. It outputs schema/table/column/constraint/count metadata only. It does not output customer values.

Expected output sections:

- schemas
- views
- enums
- sequences
- tables with columns, indexes, constraints, foreign keys
- current financial tables
- possible legacy tables
- duplicate/conflict aggregate analysis
- historical coverage aggregates
- wallet enum audit

## B. Current financial tables from repository source

Current active entities related to money/history are:

| Table/entity | Purpose | Notes |
|---|---|---|
| `wallet` | User wallet rows | Current TypeScript enum supports only `NGN` and `USD`; balances are numeric fields on wallet. |
| `financial_transaction` | Current transaction history | Used by `/transaction/*`, wallet transaction endpoints, admin money-events, receipts, and statements. |
| `provider_operation` | Idempotent provider/internal operation tracking | Has unique `(userId,type,idempotencyKey)` and unique `reference`. |
| `beneficiary` | Saved beneficiaries | Used by `/beneficiary/me`; TAG resolution uses `user.tagId`. |
| `card` | Card records | Stores masked/provider card metadata only. |
| `reward_ledger_entry` | Reward history | Points ledger, not cash ledger. Redemption remains blocked. |
| `referral_event` | Referral invite/earnings tracking | Internal referral history. |
| `notification`, `notification_device`, `notification_preference` | Notification history/preferences/devices | Used by notification endpoints. |
| `kyc_profile` | KYC state and sections | Used by MetaMap/admin review flow. |
| `dispute`, `support_ticket` | Support and disputes | Partial workflow support. |

## C. Legacy tables found

Pending production inventory. The script will mark any table outside the current known set as `POSSIBLE_LEGACY` when its name/columns look financial, wallet, notification, provider, KYC, reward, or activity related.

## D. Historical data coverage

Pending production inventory. The script returns aggregate counts only:

- total users
- users with current `financial_transaction` rows
- users with possible legacy financial rows
- users with current wallets
- users with provider-reference-bearing rows

It intentionally does not expose emails, phone numbers, names, addresses, tokens, provider payloads, or customer documents.

## E. Duplicate/conflict analysis

The script compares possible legacy financial tables to `financial_transaction` using safe reference columns where available. It reports:

| Source | Current Destination | Rows | Potential Matches | Unique Legacy Rows | Conflicts |
|---|---|---:|---:|---:|---|
| Pending operator output | `financial_transaction` | Pending | Pending | Pending | Aggregate only |

No merge is performed.

## F. Wallet enum analysis

Repository source currently defines:

```ts
export enum Currency {
  NGN = 'NGN',
  USD = 'USD',
}
```

The target Vidal Pay fiat wallets are exactly:

```text
NGN
USD
GBP
CAD
```

`EUR` is not a target Vidal Pay wallet. If the production inventory finds EUR in historical rows, it should be reported and preserved for compatibility, but not enabled as a new wallet product without explicit approval.

The production inventory must confirm:

- actual PostgreSQL enum/type name
- current enum values
- every table/column using the enum
- indexes/constraints depending on it
- whether historical rows contain non-target currencies

## G. NGN/USD/GBP/CAD migration design

Do not execute yet.

Safest likely PostgreSQL enum path if production uses a native enum:

```sql
ALTER TYPE <wallet_currency_enum_name> ADD VALUE IF NOT EXISTS 'GBP';
ALTER TYPE <wallet_currency_enum_name> ADD VALUE IF NOT EXISTS 'CAD';
```

Before this is safe, confirm from production inventory that:

- enum name is correct,
- only wallet/product columns that should accept GBP/CAD use it,
- application code can handle GBP/CAD without forcing `Currency` TypeScript enum validation failures,
- no existing check constraint restricts currency to NGN/USD,
- no migrations will run automatically on Render.

Existing NGN/USD rows must be preserved. No existing balances are recalculated by this migration.

## H. Fincra persistence design

Do not store every Fincra field directly on `wallet`. Use a normalized model so one user wallet can have provider account records and activation attempts without changing balances.

Recommended non-destructive future tables:

| Table | Purpose |
|---|---|
| `provider_customer` | Maps Vidal user to Fincra business/customer reference, status, requirements, metadata. |
| `provider_account` | Provider account/virtual account per wallet/currency/provider. |
| `wallet_activation` | Idempotent activation workflow state for requested wallet products. |
| `provider_webhook_event` | Idempotent webhook event storage, raw payload redacted/encrypted or allow-listed. |
| `provider_reconciliation_run` | Reconciliation run metadata and results summary. |

Minimum fields should include:

- userId
- walletId when applicable
- provider = FINCRA
- currency
- providerCustomerId/reference
- providerAccountId/reference
- providerVirtualAccountId/reference
- status/providerStatus
- idempotencyKey
- requirements snapshot
- redacted provider metadata
- createdAt/updatedAt

## I. Ledger design

Keep `financial_transaction` as historical/mobile transaction history. Add a real ledger beside it.

Recommended future tables:

| Table | Purpose |
|---|---|
| `ledger_account` | One ledger account per user wallet/provider clearing/fee/reward/etc. |
| `ledger_transaction` | Business event header with reference/idempotency/provider info. |
| `ledger_entry` | Debit/credit lines. Every ledger transaction balances by currency. |
| `balance_hold` | Authorized but unsettled holds/reservations. |

Rules:

- Every `ledger_transaction` must balance.
- Do not balance NGN against USD/GBP/CAD in the same currency equation.
- Use account classes: customer wallet, provider settlement, clearing, fees/revenue, rewards payable, refunds/reversals, vaults/escrow.
- `financial_transaction` can reference `ledger_transaction.reference` after cutover.

## J. Existing balance cutover design

Do not replace existing wallet balances directly.

Safe cutover design:

1. Freeze schema changes until production inventory and backup are confirmed.
2. Add ledger tables without writing opening entries.
3. For each existing wallet, compute an opening balance candidate from current wallet balance.
4. Compare opening balance candidate with historical `financial_transaction` net movement where possible.
5. Flag mismatches for reconciliation instead of auto-correcting wallet balances.
6. Create opening-balance ledger transactions only after approval.
7. During transition, read wallet balance from existing `wallet.balance`; dual-write ledger for new transactions only after feature flag.
8. Once reconciliation passes, switch balance reads to ledger-derived or ledger-snapshotted balance.
9. Keep rollback by disabling ledger read flag and preserving original wallet balances.

## K. Historical restore design

Do not run restore yet.

For each legacy source discovered, create this mapping before code execution:

| Field | Required decision |
|---|---|
| SOURCE TABLE | Production table name from inventory. |
| DESTINATION | Usually `financial_transaction`; possibly `beneficiary`/`notification` depending source. |
| MATCHING KEY | Prefer reference/providerReference/idempotencyKey; otherwise composite userId+amount+currency+createdAt after review. |
| TRANSFORMATION | Column mapping and status normalization. |
| DUPLICATE RULE | Existing destination reference wins; skip duplicate. |
| CONFLICT RULE | Do not overwrite; write conflict report. |
| IDEMPOTENCY RULE | Restore script must be repeatable and insert only missing rows. |
| DRY-RUN QUERY | Count insert/skip/conflict before any write. |
| ROLLBACK STRATEGY | Restore batch marker and delete only rows inserted by that batch if rollback is approved. |

Historical transaction restore must not change wallet balances. Restored rows are records of past activity, not money movement.

## L. Rollback plan

- Inventory has no rollback because it is read-only.
- Future migrations must be additive first.
- Currency enum expansion cannot be trivially removed in PostgreSQL; only add values after review.
- Ledger cutover must be feature-flagged.
- Restore batches must include a batch reference for reversible cleanup of inserted historical rows only.
- Never rollback by recalculating wallet balances automatically.

## M. Migration order

1. Run read-only production inventory.
2. Review table/enum/constraint output.
3. Confirm backup/recovery point.
4. Prepare additive schema migrations only.
5. Expand currency support to NGN/USD/GBP/CAD after enum audit.
6. Add provider-account and activation tables.
7. Add ledger tables.
8. Add opening-balance dry-run/reconciliation report.
9. Add dual-write feature flag for new movements.
10. Restore historical activity separately after dry-run approval.
11. Reconcile.
12. Enable Fincra sandbox wallet provisioning for one controlled test.

## N. Fincra implementation order

1. Fincra read-only capability probe.
2. Capability matrix for NGN/USD/GBP/CAD only.
3. Sandbox customer/KYC requirements mapping.
4. One individual virtual-account sandbox test.
5. Persist provider customer/account/virtual account.
6. Add idempotent webhook event storage.
7. Add reconciliation.
8. Idempotent wallet activation.
9. NGN activation.
10. USD activation.
11. GBP activation.
12. CAD activation.
13. Deposits.
14. Transfers.
15. FX.
16. Cards.

## O. VTpass placement

Do not integrate VTpass yet. It should connect after transaction/ledger/pricing foundations:

```text
Vidal Transaction Engine
→ Pricing
→ Ledger/Hold
→ VTpass Adapter
→ Requery/Reconciliation
→ Ledger Finalization
```

## P. Risks

| Priority | Risk | Reason |
|---|---|---|
| P0 | Running writes before inventory | Could duplicate or corrupt live financial records. |
| P0 | Expanding currency enum without production enum audit | PostgreSQL enum changes are hard to reverse. |
| P0 | Restoring history into `financial_transaction` without duplicate keys | Users may see duplicates and balances may be misunderstood. |
| P0 | Treating historical restore as money movement | Would corrupt balances. |
| P1 | Current wallet balances are not ledger-backed | Requires controlled cutover and reconciliation. |
| P1 | GBP/CAD not supported by TypeScript `Currency` enum | App code and DB must change together. |
| P1 | Provider fields embedded on wallet are not enough for Fincra lifecycle | Need normalized provider-account/activation/webhook records. |
| P2 | Existing provider status still references legacy Unit/PayVessel paths | Must be updated gradually after Fincra capability evidence. |
| P2 | Missing VTpass pricing/hold/requery layer | Bills should wait until ledger foundation exists. |
| P3 | Old audit JSON files in workspace | Keep local only or delete before commit. |

## Final decision

NOT SAFE TO PREPARE MIGRATIONS

Reason: live production schema/enum/legacy-table inventory has not yet been run from an authorized database environment. The safe next step is the read-only inventory script output.
