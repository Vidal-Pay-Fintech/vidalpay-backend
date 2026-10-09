# Fincra Wallet Activation Migration Requirements

This note documents the local schema/entity work required before Fincra-approved sandbox account details can be persisted as active wallet/account details. These changes are prepared for review only. Do not run production migrations until production inventory, backup, and rollback are approved.

## Current local state

Fincra virtual-account activation requests are tracked in `provider_operation` using:

- `userId`
- `type = wallet_activation`
- `idempotencyKey = wallet_activation:{userId}:{currency}`
- `reference`
- `providerReference`
- `status`
- sanitized `requestPayload`
- sanitized `responsePayload`
- `metadata`

The existing unique constraints support durable activation idempotency:

- unique `reference`
- unique `(userId, type, idempotencyKey)`

Activation requests and webhooks do not modify wallet balances or transaction history.

## Prepared migration

`1789171200000-FincraWalletActivationReadiness` adds `fincra_webhook_event` for durable Fincra webhook replay protection:

- unique `(provider, eventId)`
- provider reference
- related provider operation id
- status
- sanitized payload summary

The migration does not alter balances, transactions, or existing wallet rows.

## Wallet account-detail persistence

The wallet entity has been updated so provider/account-detail columns can be written when, and only when, a signed Fincra webhook contains real approved/active account details. The flow may create the requested wallet row for the activated currency with zero balance, or update the existing wallet row, but it must not fabricate account numbers or change balances.

Writable provider/account-detail fields include:

- `accountNumber`
- `accountName`
- `bankName`
- `routingNumber`
- `sortCode`
- `address`
- `provider`
- `providerAccountId`
- `providerVirtualAccountId`
- `providerStatus`
- `providerReference`
- `metadata`

`availableBalance` and `ledgerBalance` remain non-insertable and non-updatable through this wallet activation path.

## Production restrictions

Before production use:

1. Run the read-only production inventory and review the actual wallet column types/indexes.
2. Confirm the database enum/type supports `NGN`, `USD`, `GBP`, and `CAD`.
3. Review and test the migration against a staging copy or backup.
4. Confirm Fincra sandbox webhook payload shape for approved virtual accounts.
5. Confirm Fincra production approval per currency/product.
6. Keep provider webhooks idempotent and never process wallet credits/debits from this activation webhook.

Do not run production migrations until the migration SQL/entity changes are reviewed against the read-only production inventory and backup/rollback plan.
