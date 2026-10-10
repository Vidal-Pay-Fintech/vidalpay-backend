# VidalPay production data cleanup and restore plan

Status: prepared for review only. Do not run against production until a backup, inventory, stakeholder approval, and rollback plan are complete.

## Goal

Preserve every existing user sign-in credential while cleaning or restoring old operational data in a way that does not destroy auditability, balances, transactions, KYC evidence, provider operations, notifications, beneficiaries, cards, or support records.

## Non-negotiable rules

1. Never delete rows from `user` when preserving login access.
2. Never overwrite `password`, `email`, `phoneNumber`, `role`, `status`, `accountStatus`, `pin`, or auth/session data during cleanup.
3. Never change wallet balances with a cleanup script.
4. Never delete transaction or provider-operation history; archive or mark superseded records instead.
5. Run every restore or cleanup script first in dry-run mode against a staging copy.
6. Production execution requires a fresh database backup and a written rollback command.

## Required phases

### 1. Read-only inventory

Run `scripts/readonly-production-inventory.js` against Render PostgreSQL with `BEGIN READ ONLY`. Save the output as `production-readonly-inventory.json`; do not commit it.

### 2. Schema mapping

Map legacy and current tables by purpose:

- users and credentials
- wallets and account details
- financial transactions
- beneficiaries
- notifications and devices
- KYC profiles/documents
- cards
- provider operations/webhook events
- support tickets and messages

### 3. Dry-run restore candidates

Generate candidate merge rows without mutation. Each candidate must show:

- source table and primary key
- target table and primary key
- conflict strategy
- whether the target already has a newer value
- reason the row is safe or unsafe

### 4. Credential preservation

For each existing user, preserve these fields exactly:

- `id`
- `email`
- `phoneNumber`
- `password`
- `pin`
- `role`
- `status`
- `accountStatus`
- `isVerified`
- `isPhoneVerified`
- auth/session records where present

### 5. Financial preservation

Transactions, wallet balances, provider operations, and card records must be append-only. If old rows need replacement, create an archive/superseded marker rather than deleting the row.

### 6. KYC preservation

KYC can be reset for onboarding only when the previous KYC state is archived and linked. Fincra KYC can become the primary path for Nigeria when configured, while MetaMap remains fallback.

### 7. Execution plan

Approved cleanup scripts must support:

- `--dry-run`
- `--output report.json`
- `--limit N`
- `--user-id USER_ID`
- `--apply` only after explicit approval

### 8. Verification

After cleanup or restore, verify:

- existing user login still works
- wallet balances match pre-cleanup totals
- transaction counts match or increase only by approved archive markers
- KYC status loads
- beneficiaries load
- notifications load
- provider operations still deduplicate by idempotency key

## Current status

No destructive cleanup is implemented. The backend now has the plan needed to prepare a safe migration/restore step without touching production data.
