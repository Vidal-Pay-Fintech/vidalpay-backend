# Fincra KYC, FX, wallet, card, and VTU readiness

## Environment safety and verification

- `FINCRA_ENV=sandbox` is the default, with `https://sandboxapi.fincra.com`.
- `FINCRA_ENV=live` explicitly selects `https://api.fincra.com`. No deployment settings were changed by this patch.
- `FINCRA_BASE_URL` is optional. If supplied, it must exactly match the selected official HTTPS origin, without userinfo, path, query, or fragment. Invalid/mismatched settings fail at startup instead of silently falling back.
- Authenticated requests cannot override the origin or follow redirects. The sandbox probe refuses live configuration. A timeout, 4xx/5xx, or business rejection is not successful authentication.
- Use separate deployments/databases for sandbox and live, with separate API keys, business IDs, webhook secrets, queues and provider identifiers. Never point live keys at a database containing sandbox accounts. The code cannot determine a credential's environment from its value.
- `npm run verify:core` runs local backend tests/build, schema-repair tests, mobile type checking and mobile policy tests. It reports real-provider/device/deployment checks as unverified; it does not deploy or transact.
- The Render login failure is still confirmed by the supplied 2026-10-15 log: PostgreSQL `42703`, `column user.region does not exist`. The local repair has not been applied to the deployed database; see the procedure below. The general `db:migrate` command remains a no-op; do not substitute the MySQL-oriented historical migration on PostgreSQL.

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

The check inspects columns, required unmapped fields/defaults and currency enum support without reading customer records or writing data. If it reports incompatible types, required unmapped fields, or unsupported currencies, stop for a reviewed migration. It does not automatically change financial columns, enum types, constraints or defaults.

If it reports only the expected missing nullable account/provider columns, apply and recheck:

```sh
npm run db:repair-wallet-schema -- --apply
npm run db:repair-wallet-schema -- --check
```

This adds only the missing allowlisted nullable fields, in a transaction with lock/statement timeouts. It does not create tables, replace `routingProvider`/`providerMetadata`, infer historical provider mappings, activate wallets, or update balances. Retry profile loading, KYC country confirmation and wallet account-detail requests after `missing: []`. The local patch has not been applied to Render by this task.

The browser log separately reports transaction HTTP 503 and beneficiary HTTP 500 errors, plus web notification/deprecation warnings. The shared audit excerpt includes historical `transaction` and `user_kyc` tables, while the current entities use `financial_transaction` and `kyc_profile`; the excerpt does not establish whether those latter tables also exist. A complete schema comparison and an explicit historical-data mapping are still required. Do not rename tables or create empty replacements to conceal existing financial history. The wallet repair is not a claim that all those errors or live KYC are resolved.

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
