# Fincra KYC, FX, wallet, card, and VTU readiness

## Environment safety and verification

- `FINCRA_ENV=sandbox` is the default, with `https://sandboxapi.fincra.com`.
- `FINCRA_ENV=live` explicitly selects `https://api.fincra.com`. No deployment settings were changed by this patch.
- `FINCRA_BASE_URL` is optional. If supplied, it must exactly match the selected official HTTPS origin, without userinfo, path, query, or fragment. Invalid/mismatched settings fail at startup instead of silently falling back.
- Authenticated requests cannot override the origin or follow redirects. The sandbox probe refuses live configuration. A timeout, 4xx/5xx, or business rejection is not successful authentication.
- Use separate deployments/databases for sandbox and live, with separate API keys, business IDs, webhook secrets, queues and provider identifiers. Never point live keys at a database containing sandbox accounts. The code cannot determine a credential's environment from its value.
- `npm run verify:core` runs local backend tests/build, schema-repair tests, mobile type checking and mobile policy tests. It reports real-provider/device/deployment checks as unverified; it does not deploy or transact.
- The supplied 2026-10-15 Render log identified PostgreSQL `42703`, `column user.region does not exist`. The user subsequently supplied successful repair output adding `region`, followed by `missing: []`. This confirms that repair in the reported target, not independent live login or KYC verification. The procedure below remains a runbook for other affected targets, not an instruction to repeat an already-completed repair. The general `db:migrate` command remains a no-op; do not substitute the MySQL-oriented historical migration on PostgreSQL.

Official references: https://docs.fincra.com/reference/rates and https://docs.fincra.com/di/docs/bvn-resolution-1.

## Render login schema repair

The login query selects `user.region` before checking the password, so this database/schema mismatch causes HTTP 500 independently of the supplied credentials. Browser animation/font deprecation warnings are not the cause.

1. Ensure the reviewed backend revision containing `scripts/repair-kyc-region.js` and its package command is deployed. A script present only in the local checkout is not available in Render's shell.
2. In the affected backend service's Render shell, confirm the intended database target and a usable backup. Keep database URLs and credentials private. The script reads the service's existing `DATABASE_URL` and `DB_SSL`; it does not load a local `.env` file.
3. Run the read-only check:

   ```sh
   npm run db:repair-kyc-region -- --check
   ```

   Exit code 2 means required columns are missing. Other failures need investigation before applying anything.

4. After reviewing the target and missing-column output, run the additive repair and then check again:

   ```sh
   npm run db:repair-kyc-region -- --apply
   npm run db:repair-kyc-region -- --check
   ```

   The repair adds only missing nullable `countryCode`, `residency`, and `region` columns in a transaction with bounded lock/statement timeouts. It does not delete accounts, reset passwords, infer residence, approve KYC, or activate wallets. A lock timeout is a failed/rolled-back attempt, not success.

5. Confirm `missing: []`, retry login with the user's own credentials, and inspect the new server logs. This resolves the demonstrated missing-column failure only; any subsequent error needs separate diagnosis. Do not enable TypeORM synchronization to work around it.

## Fincra KYC

### Profile confirmation and wallet schema

The later 2026-10-15 Render exception is a separate schema failure: `column "address" of relation "wallet" does not exist` during `ensureCustomerWallets`. `PATCH /user/profile` updated residence and then called `getCurrentUser`, which tried to insert the missing GBP/CAD local wallet records. This made the KYC country-confirmation screen report HTTP 500 even though the failure was wallet persistence, not a Fincra or MetaMap response.

Profile/session reads now return existing wallet records without creating optional wallets. Wallet APIs still perform their own creation/checks; this does not hide wallet-storage errors or treat missing account details as activation. New local wallet records use `FINCRA` and `NOT_PROVISIONED`, never a guessed PayVessel/Unit assignment or credential-based active status. Existing provider records and balances are not migrated. An unknown provider remains null in normalized responses.

The supplied audit confirms missing `wallet.address`, `wallet.provider`, `wallet.providerStatus`, and `wallet.metadata`. It also lacks the legacy `ledgerBalance` alias. Read-only balance aliases no longer have ORM defaults, which prevents TypeORM from unnecessarily including them in `INSERT ... RETURNING`. This is a code change only; existing database balance/default definitions are untouched.

After deploying the reviewed backend revision containing the new repair script, use the affected Render backend shell and confirm the database target and backup:

```sh
npm run db:repair-wallet-schema -- --check
```

The check inspects columns, required unmapped fields/defaults and currency enum support without reading customer records or writing data. It does not automatically change financial columns, enum types, constraints or defaults. The user's subsequent Render output confirms that this check and `--apply` both refused because the wallet currency enum lacks GBP/CAD; neither command applied the column repair. Use the separate currency procedure below first. Incompatible types or required unmapped fields still require separate review, not a bypass of these guards.

### Missing GBP/CAD wallet enum values

Deploy the reviewed backend revision containing `scripts/repair-wallet-currencies.js` and its package command before using it in Render. In the affected backend service shell, confirm the intended database and a usable backup, then inspect without changing data:

```sh
npm run db:repair-wallet-currencies -- --check
```

Review `enumType`, `values`, and `missing`. The script discovers the enum actually attached to `public.wallet.currency`; it does not guess its name. Exit code 2 means GBP and/or CAD is missing. It refuses missing/non-enum columns, an enum without NGN/USD, or one shared with other table columns. Stop for review on those errors. Do not paste connection strings or credentials into logs or chat.

Only after reviewing the target and expected missing values, apply and recheck:

```sh
npm run db:repair-wallet-currencies -- --apply
npm run db:repair-wallet-currencies -- --check
```

This separately committed repair adds only missing GBP/CAD labels, preserves existing labels and records, and requires PostgreSQL 12+ and permission to alter the enum. It uses bounded lock/statement timeouts and rolls back if the operation fails before commit. A connection failure during commit can leave the outcome uncertain: reconnect and run `--check` before retrying. Once committed, labels are not automatically removed as a rollback; do not drop/recreate the type or rewrite financial tables to remove them. PostgreSQL requires new enum values to be committed before application queries use them: https://www.postgresql.org/docs/current/sql-altertype.html.

After the currency check reports `missing: []`, run the column check again:

```sh
npm run db:repair-wallet-schema -- --check
```

If it reports only the expected missing nullable account/provider columns, apply and recheck:

```sh
npm run db:repair-wallet-schema -- --apply
npm run db:repair-wallet-schema -- --check
```

This adds only the missing allowlisted nullable fields, in a transaction with lock/statement timeouts. It does not create tables, replace `routingProvider`/`providerMetadata`, infer historical provider mappings, activate wallets, or update balances. Retry profile loading, KYC country confirmation and wallet account-detail requests after `missing: []`. The local patch has not been applied to Render by this task.

The currency repair only makes those codes storable. It does not create customer wallets or provider accounts, grant merchant currency entitlements, approve KYC, or activate spending. Live Fincra, MetaMap, and final-review behavior must still be verified separately.

Local verification: the 31 region/wallet-column/currency unit tests pass. A separate disposable loopback PostgreSQL integration test also passes: it reproduces the pre-repair refusal, verifies a real mid-repair rollback, applies both repairs in order, verifies repeat runs are no-ops, preserves the original test rows/balances, and accepts GBP/CAD only after the currency commit. These are local database results, not verification of Render or a complete provider journey. The optional integration test uses only `VIDALPAY_CURRENCY_TEST_URL`, requires an empty dedicated `vidalpay_repair_test_*` database on loopback, and never uses the service's `DATABASE_URL`.

The subsequent focused audit confirms that `financial_transaction` and `kyc_profile` are missing. It also reports 20 existing `provider_operation` rows in a different schema: `operationType` is an enum, `type`, `providerReference`, and `errorCode` are absent, and provider/status/currency are enums. The 2026-10-16 Render log confirms `ProviderOperation.type` fails in `startKyc`. This is independent of the wallet error. Transaction HTTP 503 remains unresolved until a verified mapping of the existing historical `transaction` rows is implemented. Do not rename tables or create an empty transaction table to conceal history. Beneficiary HTTP 500 and browser warnings remain separate diagnoses.

### Provider-operation and KYC storage repair

The reviewed `scripts/repair-kyc-storage.js` command prepares PostgreSQL storage for the current KYC implementation. Deploy this command together with the entity change allowing explicit `user.kycStatus` updates; leaving that field non-writable causes TypeORM status updates to fail even after schema repair. General reads/inserts still omit this compatibility field.

Run the following in the affected Render service shell after confirming the database target and backup:

```sh
npm run db:repair-kyc-storage -- --check
```

This is read-only and reports schema changes, row counts, aggregate legacy status counts, and blockers without customer identity values. Missing columns alone are insufficient to decide on a repair: old enum values, required columns, unique references, and KYC history must also be compatible.

If `blockers` is empty and the reported changes match this deployment, apply and recheck:

```sh
npm run db:repair-kyc-storage -- --apply
npm run db:repair-kyc-storage -- --check
```

The transaction adds `type`, `providerReference`, and `errorCode` where missing; copies `operationType` verbatim into an absent `type`; converts provider/status/currency and `user.kycStatus` enum columns to varchar preserving existing values/defaults; and makes the legacy `operationType` column nullable without a default so current KYC inserts can omit it. Existing external/internal references are retained without guessing their relationship to `providerReference`. Unique reference and user/type/idempotency indexes are required; duplicates cause a refusal, never deletion or deduplication. Enum types themselves and the original legacy columns are retained. The new and old operation formats are not interchangeable for an older backend deployment, so use a coordinated deployment rather than rolling back only application code.

`kyc_profile` is created with a unique user link and profiles are seeded only when each affected user's legacy KYC state is absent or exactly `NOT_STARTED`, with no submitted evidence. The legacy `user_kyc` table remains intact, and seeded profiles retain the legacy source ID. Any existing approval, rejection, in-progress state, or submitted identity/review evidence stops the migration for explicit mapping. No approval is manufactured or revoked. Existing current profiles are preserved. The command does not create `financial_transaction`, change wallet balances, issue accounts, or contact providers.

Apply takes bounded locks and verifies the resulting schema and provider-operation row count before commit. Failures roll back; after an uncertain connection failure, reconnect and run `--check`. Committed changes require a reviewed rollback plan, not dropping tables or enum types. Successful storage repair permits further KYC testing but does not prove Fincra credentials, MetaMap webhooks, final review, or account activation.

The optional integration test (`node --test scripts/repair-kyc-storage.integration.test.js`) requires `VIDALPAY_KYC_TEST_URL` pointing to an empty dedicated `vidalpay_repair_test_*` database on loopback. It owns and resets that disposable database's public schema. It never reads the deployment's `DATABASE_URL`. Tests cover preservation of 20 fixture rows and original column values, new KYC writes, idempotency uniqueness, repeated application, rollback, and rejection of ambiguous legacy KYC/evidence and unsupported required/default fields.

Local validation on 2026-10-16: 102 service/metadata tests, eight PostgreSQL integration scenarios, and TypeScript checking passed. The temporary PostgreSQL server was stopped. The Render migrations and live verification journey have not been executed by this task.

The implemented first step is Fincra's Nigerian BVN check, requiring:

- `FINCRA_KYC_ENABLED=true`
- `FINCRA_API_KEY`
- `FINCRA_BUSINESS_ID`

`POST /kyc/start` first returns Fincra backend verification. The BVN response must explicitly succeed and its first name, last name and date of birth must match the stored customer identity. Unknown or mismatched results cannot advance. Update missing personal information before submitting. Raw BVN and provider face images are not stored in provider operations.

After that server-side check, the next start request launches MetaMap. The mobile identity form returns to that launch step instead of the unimplemented document-upload path. MetaMap is a required second step, not a fallback around a failed Fincra check.

Signed MetaMap approval places the account in `MANUAL_REVIEW`, not `VERIFIED`. Final approval requires a super-admin, matching persisted provider evidence, and the same customer identity/environment. The final write requires the same verification reference and manual-review state, so it cannot overwrite a concurrent rejection. Client-submitted provider/reviewer flags are not trusted. Storage failures block verification writes while legacy session reads remain supported.

Foreign-country Fincra customer-check contracts and per-currency final-review workflows are NOT implemented by this change. They must not be simulated with the Nigerian BVN endpoint or by treating MetaMap alone as approval. Existing legacy `VERIFIED` accounts have not been bulk-revoked or backfilled; their approval evidence still needs review.

New MetaMap launches carry a server-generated session identifier which must return in the signed webhook metadata. In-flight legacy sessions without this binding must be reviewed and restarted; they cannot approve or reject a different customer's profile through client-supplied metadata.

## FX rates and quotes

Implemented endpoints:

- `GET /fx/rates`
- `GET /fx/quotes?fromCurrency=NGN&toCurrency=USD&amount=1000`
- `GET /user/home` now includes `exchangeRates`

Supported display currencies are:

- NGN
- USD
- GBP
- CAD

Rates are read-only through Fincra treasury rates when `FINCRA_API_KEY` is configured. Quotes are `QUOTE_ONLY` and `executable=false`.

The backend parses the documented `price` field and follows bounded pagination. Mobile Home reads `/fx/rates`, not an amount-less `/fx/quotes` request. Sandbox rates are labelled Sandbox; public fallback/display estimates are Reference rates, not executable quotes or measured price movements.

`POST /fx/convert` remains blocked until ledger holds, settlement, reconciliation, and reversal behavior are implemented.

## Wallet activation

Fincra wallet activation continues to be idempotent and provider-backed. It does not create fake account numbers or alter balances. Wallets become active only when a verified provider webhook returns real account details that can be safely persisted.

## Cards

Current provider decision:

- NGN virtual/physical cards: Sudo sandbox adapter remains the implemented card issuer.
- Fincra cards: blocked until Fincra card issuing API access is proven.
- USD/foreign cards: blocked until provider customer/account/card mappings are implemented and tested.

## VTU.ng

VTU.ng v2 adapter support is now prepared for:

- JWT authentication
- catalog reads
- utility customer validation
- airtime/data/electricity purchase submission
- requery support
- webhook receipt

Purchases currently create ledger holds and provider operations; webhook settlement/reversal logic exists. Automatic requery, timeout reconciliation, immediate terminal-response handling and multi-instance token coordination still need validation/fixes. Do not treat this adapter as production-ready or as a free sandbox.

## Remaining provider migration work

The requested target is Fincra wallets and VTU bills, with no new PayVessel routing. Legacy PayVessel/Unit wallet readiness labels, fallback paths and other provider references still exist outside this patch. Migrate those separately while preserving historical records. Do not infer merchant entitlements, financial limits, foreign KYC availability, card issuing or loan readiness from credentials or passing local tests.

## Crypto and stablecoins

USDT, USDC, and CNGN remain excluded from ordinary user wallet products. Crypto remains blocked until provider access, signing, compliance, custody, and ledger flows are complete.
