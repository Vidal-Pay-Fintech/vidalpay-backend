# VidalPay Backend Mobile Contract

This backend exposes the mobile app routes under `/api/v1` through Nest URI
versioning. Every mobile-visible provider feature either returns real backend
state, calls a provider only when backend sandbox credentials are configured, or
returns a structured unavailable response.

## Inventory

- Framework/runtime: NestJS 11 on Node.js/TypeScript.
- Database/ORM: PostgreSQL 18 through TypeORM for the existing Render
  database. The runtime also retains the legacy MySQL connection fallback.
  Production startup uses the existing `DATABASE_URL` with
  `synchronize: false` and `migrationsRun: false`; the Render start command
  must not run `db:migrate` against the existing database.
- Auth: JWT bearer access tokens, rotating refresh tokens, and persisted
  revocable session families in `auth_session`.
- Jobs/queues: none found.
- Existing providers before this pass: email through SMTP/nodemailer, SMS
  helper through Twilio, Google OAuth strategy. No Resend API integration or
  Unit.co, PayVessel, FX,
  crypto, investment, loan, card, or bill-payment module existed.
- Webhooks before this pass: none found.
- API modules before this pass: auth, user scaffold, wallet scaffold, database
  scaffold, mail, tokens.
- Test setup: Jest/ts-jest unit tests under `src/**/*.spec.ts`; e2e config in
  `test/jest-e2e.json`.
- API docs: Swagger is mounted at `/api-docs`.

## Mobile Contract Matrix

| Feature                    | Mobile Expected Endpoint                                                                                                     | Backend Exists? | Handler                                 | Service                 | DB Model                                                              | Provider Connected?              | Functional?                                                  | Missing Work                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------: | --------------------------------------- | ----------------------- | --------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Signup                     | POST `/auth/sign-up`                                                                                                         |             Yes | `AuthenticationController`              | `AuthenticationService` | `user`, `wallet`, `auth_session`                                      | Internal                         | Yes                                                          | SMTP delivery must be configured                                                                                               |
| Login                      | POST `/auth/login`                                                                                                           |             Yes | `AuthenticationController`              | `AuthenticationService` | `user`, `auth_session`                                                | Internal                         | Yes                                                          | None                                                                                                                           |
| Logout                     | POST `/auth/logout`                                                                                                          |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Logout all                 | POST `/auth/logout-all`                                                                                                      |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Refresh                    | POST `/auth/refresh-token`                                                                                                   |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Session check              | GET `/auth/me`                                                                                                               |             Yes | `AuthenticationController`              | `AuthenticationService` | `user`                                                                | Internal                         | Yes                                                          | None                                                                                                                           |
| Reauth                     | POST `/auth/reauth`                                                                                                          |             Yes | `AuthenticationController`              | `AuthenticationService` | `user`                                                                | Internal                         | Yes                                                          | None                                                                                                                           |
| Sessions                   | GET `/auth/sessions`                                                                                                         |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Revoke session             | POST `/auth/sessions/:familyId/revoke`                                                                                       |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Revoke others              | POST `/auth/sessions/revoke-others`                                                                                          |             Yes | `AuthenticationController`              | `AuthenticationService` | `auth_session`                                                        | Internal                         | Yes                                                          | None                                                                                                                           |
| Email OTP                  | POST `/auth/verify-email`, POST `/auth/resend-otp`                                                                           |             Yes | `AuthenticationController`              | `AuthenticationService` | `token`                                                               | Resend/SMTP                      | Yes                                                          | Resend API key and verified sender, or SMTP fallback, required                                                                 |
| Transaction PIN            | POST `/auth/transaction-pin/request`, `/verify`, `/set`, `/validate`                                                         |             Yes | `AuthenticationController`              | `AuthenticationService` | `token`, `user`                                                       | Internal/Resend/SMTP             | Yes                                                          | Email provider required for OTP delivery                                                                                       |
| Password reset             | POST `/auth/password-reset/request`, `/verify-otp`, `/complete`                                                              |             Yes | `AuthenticationController`              | `AuthenticationService` | `token`, `user`                                                       | Resend/SMTP                      | Yes                                                          | Resend API key and verified sender, or SMTP fallback, required                                                                 |
| User profile/account level | GET `/user/me`, GET `/user/home`, GET `/user/security`, GET `/user/account-level`, GET `/user/limits`, PATCH `/user/profile` |             Yes | `UserController`                        | `VidalpayService`       | `user`, `wallet`, optional `kyc_profile` for session restoration      | Internal                         | Yes                                                          | `/user/me` remains available for legacy databases without `kyc_profile`; KYC mutations remain unavailable until storage exists |
| Contact changes            | POST `/user/security/change-email/*`, `/change-phone/*`                                                                      |             Yes | `UserController`                        | `VidalpayService`       | `user`, `token`                                                       | Resend/SMTP                      | Yes                                                          | Phone OTP is delivered by email until SMS copy is added                                                                        |
| Account closure/deletion   | POST `/user/account/closure`, POST `/user/account/deletion`                                                                  |             Yes | `UserController`                        | `VidalpayService`       | `user`                                                                | Internal                         | Closure works; permanent deletion blocked                    | Add retention/provider-offboarding policy before hard deletion                                                                 |
| Scheduled transfers        | GET/POST `/user/scheduled-transfers`                                                                                         |             Yes | `UserController`                        | `VidalpayService`       | `provider_operation`                                                  | Scheduler/provider jobs required | Listing disabled; create blocked                             | Add durable scheduler, retry, and PIN authorization jobs                                                                       |
| KYC                        | POST `/kyc/start`, GET `/kyc/status`, POST `/user/kyc/*`                                                                     |             Yes | `KycController`, `UserController`       | `VidalpayService`       | `kyc_profile`                                                         | MetaMap if env exists            | Partial                                                      | Configure MetaMap env and webhook                                                                                              |
| Wallets                    | GET `/wallets`, `/wallets/ngn`, `/wallets/usd`                                                                               |             Yes | `WalletsController`                     | `VidalpayService`       | `wallet`                                                              | Internal ledger                  | Yes                                                          | Provider account provisioning                                                                                                  |
| Account details            | GET `/wallets/ngn/account-details`, `/wallets/usd/account-details`                                                           |             Yes | `WalletsController`                     | `VidalpayService`       | `wallet`                                                              | PayVessel/Unit when provisioned  | Partial                                                      | Configure and live-test provider provisioning                                                                                  |
| Wallet transactions        | GET `/wallets/transactions`, `/wallets/ngn/transactions`, `/wallets/usd/transactions`, `/wallet/transactions`                |             Yes | `WalletsController`, `WalletController` | `VidalpayService`       | `financial_transaction`                                               | Internal                         | Yes                                                          | Provider transaction sync jobs                                                                                                 |
| TAG transfer               | POST `/transfers/internal`                                                                                                   |             Yes | `TransfersController`                   | `VidalpayService`       | `wallet`, `provider_operation`, `financial_transaction`               | Internal ledger                  | Yes                                                          | Add fraud/risk limits                                                                                                          |
| External transfer          | POST `/wallet/external-transfer`, `/resolve`, GET `/wallet/catalogs/banks`                                                   |             Yes | `WalletController`                      | `VidalpayService`       | `provider_operation`                                                  | PayVessel/Unit required          | Blocked                                                      | Configure provider rails and webhooks                                                                                          |
| Transactions               | GET `/transaction/me`, `/:id`, `/:id/receipt`, `/me/statement`                                                               |             Yes | `TransactionController`                 | `VidalpayService`       | `financial_transaction`                                               | Internal                         | Yes                                                          | PDF/CSV export if required                                                                                                     |
| Deposits                   | POST `/wallet/top-up/card`, GET `/wallet/top-up/card/:reference`                                                             |             Yes | `WalletController`                      | `VidalpayService`       | `provider_operation`                                                  | Payment provider required        | Blocked                                                      | Configure processor and webhook                                                                                                |
| FX                         | GET `/fx/quotes`, POST `/fx/convert`                                                                                         |             Yes | `FxController`                          | `VidalpayService`       | `provider_operation`                                                  | FX provider required             | Blocked                                                      | Choose/configure FX provider                                                                                                   |
| Cards                      | GET `/cards`, POST `/cards/virtual`, `/physical`, card lifecycle routes                                                      |             Yes | `CardsController`                       | `VidalpayService`       | `card`, `provider_operation`                                          | Unit/PayVessel required          | Listing works; mutations blocked                             | Provider customer/card mapping                                                                                                 |
| Bills                      | GET `/wallet/catalogs/airtime`, `/data`, `/utilities`; POST purchase/validate routes                                         |             Yes | `WalletController`                      | `VidalpayService`       | `provider_operation`                                                  | PayVessel required               | Catalog empty/unavailable; mutations blocked                 | Configure PayVessel biller APIs                                                                                                |
| Notifications              | GET/POST `/notifications*`                                                                                                   |             Yes | `NotificationsController`               | `VidalpayService`       | `notification*`                                                       | Internal                         | Yes                                                          | Push delivery worker                                                                                                           |
| Support/disputes/legal     | `/support/*`, POST `/disputes`, `/legal/*`                                                                                   |             Yes | Support, Disputes, Legal controllers    | `VidalpayService`       | `support_ticket`, `dispute`                                           | Internal intake                  | Yes                                                          | Provider dispute submission if needed                                                                                          |
| Crypto                     | GET `/crypto/overview`, `/assets`                                                                                            |             Yes | `CryptoController`                      | `VidalpayService`       | none                                                                  | Provider required                | Honest disabled response with null portfolio values          | Select provider                                                                                                                |
| Investments                | GET `/investments/*`, POST `/investments/account`, `/orders`                                                                 |             Yes | `InvestmentsController`                 | `VidalpayService`       | `provider_operation`                                                  | Provider required                | Reads disabled with null portfolio values; mutations blocked | Select provider                                                                                                                |
| Loans                      | GET/POST `/loans/*`                                                                                                          |             Yes | `LoansController`                       | `VidalpayService`       | `provider_operation`                                                  | Unit credit required             | Reads disabled; mutations blocked                            | Unit credit program setup                                                                                                      |
| Tax                        | GET `/tax/status`, `/tax/overview`, POST `/tax/filings`                                                                      |             Yes | `TaxController`                         | `VidalpayService`       | `provider_operation`                                                  | Tax provider required            | Reads disabled with null counts; filing blocked              | Select provider/legal flow                                                                                                     |
| Rewards/referrals          | GET/POST `/rewards/*`, `/referrals/*`                                                                                        |             Yes | Rewards, Referrals controllers          | `VidalpayService`       | `user`, `reward_ledger_entry`, `referral_event`, `provider_operation` | Internal                         | Ledger/history and invite tracking work; redemption blocked  | Define reward redemption policy and wallet-credit journal                                                                      |
| QR/money requests          | `/qr/*`, `/money-requests/*`                                                                                                 |             Yes | QR, MoneyRequests controllers           | `VidalpayService`       | `provider_operation`                                                  | Internal/provider flow required  | Blocked/unimplemented                                        | Define QR payload and request ledgers                                                                                          |
| Provider status            | GET `/providers/status`                                                                                                      |             Yes | `ProvidersController`                   | `ProviderStatusService` | none                                                                  | Env-aware                        | Yes                                                          | Live sandbox probes                                                                                                            |

## Provider Research Matrix

| Provider            | Capability                         |        Sandbox Available? | Official Docs URL                                                                | API Endpoint                            | Required Credentials                                              |     Webhook Needed? | Supported Now?      | Notes                                                                                                     |
| ------------------- | ---------------------------------- | ------------------------: | -------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- | ------------------: | ------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit.co             | USD wallet/account rails           |                       Yes | https://www.unit.co/docs/api/accounts/deposit-accounts/overview/                 | `/accounts`, `/applications`            | `UNIT_API_TOKEN`, customer/application data                       |                 Yes | Not live-tested     | Backend returns local wallet and blocks account provisioning until credentials and customer mapping exist |
| Unit.co             | USD virtual cards                  |                       Yes | https://www.unit.co/docs/api/cards/api/                                          | `/cards` with virtual debit card types  | `UNIT_API_TOKEN`, customer/account/card program                   |                 Yes | Blocked             | Official docs include individual/business virtual debit card creation                                     |
| Unit.co             | USD physical cards                 |                       Yes | https://www.unit.co/docs/api/cards/api/                                          | `/cards` with physical debit card types | `UNIT_API_TOKEN`, customer/account/card program, shipping address |                 Yes | Blocked             | Supported by Unit card API but not wired to a VidalPay provider customer yet                              |
| Unit.co             | Card lifecycle                     |                       Yes | https://www.unit.co/docs/api/cards/api/                                          | freeze/unfreeze/close card actions      | `UNIT_API_TOKEN`, provider card id                                |                 Yes | Blocked             | No local full PAN/CVV storage added                                                                       |
| Unit.co             | Loans/credit                       |                       Yes | https://www.unit.co/docs/api/credit-accounts/overview/                           | credit account APIs                     | `UNIT_API_TOKEN`, credit program setup                            |                 Yes | Blocked             | No APR/offers are fabricated                                                                              |
| PayVessel           | NGN virtual accounts               |                       Yes | https://docs.payvessel.com/api-reference/virtual-accounts/create-virtual-account | virtual account API                     | `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`                       |                 Yes | Blocked             | No account number is generated locally                                                                    |
| PayVessel           | NGN transfers                      |                       Yes | https://docs.payvessel.com/api-reference/transfers/initiate-transfer             | transfer API                            | `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`                       |                 Yes | Blocked             | External debits are blocked until provider execution is configured                                        |
| PayVessel           | Virtual cards                      |                       Yes | https://docs.payvessel.com/api-reference/virtual-cards/create-customer-card      | virtual card API                        | `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`                       |                 Yes | Unsupported for NGN | Docs reviewed describe card issuing, but NGN card support was not confirmed                               |
| PayVessel           | Airtime/data/utilities             |                       Yes | https://docs.payvessel.com/api-reference/biller-reseller/create-order            | biller reseller order API               | `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`                       |                 Yes | Blocked             | Catalogs return empty/unavailable until provider catalog calls are live-tested                            |
| FX provider         | Quotes/conversion                  | No provider found in repo | N/A                                                                              | N/A                                     | `FX_PROVIDER_BASE_URL`, `FX_PROVIDER_API_KEY`                     | Depends on provider | Blocked             | Backend does not invent rates                                                                             |
| Crypto provider     | Overview/assets/deposit/withdrawal | No provider found in repo | N/A                                                                              | N/A                                     | `CRYPTO_PROVIDER`, `CRYPTO_PROVIDER_API_KEY`                      |                 Yes | Blocked             | Overview/assets return honest disabled state with null values, not fabricated positions                   |
| Investment provider | Products/orders                    | No provider found in repo | N/A                                                                              | N/A                                     | `INVESTMENT_PROVIDER`, `INVESTMENT_PROVIDER_API_KEY`              |                 Yes | Blocked             | No products or portfolio values are fabricated                                                            |

## Structured Responses

Session reauthentication accepts either credential shape:

```http
POST /api/v1/auth/reauth
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{ "password": "ExamplePassword1!" }
```

or:

```json
{ "pin": "1234" }
```

`transactionPin` is also accepted as an alias for `pin`. A successful
reauthentication returns `{ "authenticated": true }`; invalid credentials
return a validation or authentication error and never unlock the client.

## Phone Number Handling

- Signup accepts international E.164 phone numbers such as `+2348012345678`
  and `+15551234567`.
- If mobile sends a local US number with `countryCode: "US"` or
  `country: "United States"`, the backend normalizes it to `+1...` before
  storage.
- If mobile sends a local Nigerian number with `countryCode: "NG"` or
  `country: "Nigeria"`, the backend normalizes it to `+234...`.
- Login and phone OTP lookup try safe phone variants so US users are not forced
  into Nigerian `+234` formatting.

Wallet response example:

```json
{
  "id": "wallet-id",
  "currency": "NGN",
  "balance": 0,
  "availableBalance": 0,
  "ledgerBalance": 0,
  "accountNumber": null,
  "accountName": null,
  "bankName": null,
  "routingNumber": null,
  "address": null,
  "provider": "PayVessel",
  "providerCustomerId": null,
  "providerAccountId": null,
  "providerVirtualAccountId": null,
  "providerStatus": "MISSING_CREDENTIALS",
  "providerReference": null,
  "metadata": null
}
```

Blocked response example:

```json
{
  "code": "PROVIDER_UNAVAILABLE",
  "message": "external_transfer is not available from the configured backend provider.",
  "feature": "external_transfer",
  "capability": "bank_transfer",
  "reason": "External transfers must be executed by Unit.co or PayVessel; no live-tested provider path is configured.",
  "missingRequirements": ["PAYVESSEL_API_KEY", "PAYVESSEL_API_SECRET"],
  "provider": "PayVessel",
  "retryable": false
}
```

Provider status item example:

```json
{
  "provider": "Unit.co",
  "providerType": "CARD",
  "capability": "usd_virtual_card",
  "enabled": false,
  "envConfigured": false,
  "liveTested": false,
  "status": "UNAVAILABLE",
  "readinessStatus": "MISSING_CREDENTIALS",
  "missingEnvVars": ["UNIT_API_TOKEN"],
  "failureReason": "Missing backend environment variables: UNIT_API_TOKEN",
  "service": "Unit sandbox virtual debit cards",
  "capabilities": ["usd_virtual_card"],
  "mode": "development"
}
```

## Required Environment Variables

- Database: the existing Render PostgreSQL `DATABASE_URL`, optional `DB_SSL`,
  optional `DB_CONNECT_TIMEOUT_MS`; legacy MySQL variables remain supported
  for environments that still use them.
- JWT: `JWT_SECRET`, `JWT_TOKEN_AUDIENCE`, `JWT_TOKEN_ISSUER`,
  `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`. The legacy
  `JWT_ACCESS_TOKEN_TtL` spelling is still accepted as a fallback.
- Email/SMS: Resend uses `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and optional
  `RESEND_FROM_NAME` through the backend HTTPS API. The official send endpoint is
  `https://api.resend.com/emails`; a Resend sending-access key and a verified
  sender/domain are recommended. SMTP remains the fallback through
  `SMTP_MAIL_HOST`, `SMTP_MAIL_PORT`, `SMTP_MAIL_USERNAME`,
  `SMTP_MAIL_PASSWORD`, and optional `SMTP_MAIL_FROM`. The mail service also
  accepts the existing aliases `SMTP_HOST`/`MAIL_HOST`,
  `SMTP_PORT`/`MAIL_PORT`, `SMTP_USER`/`MAIL_USER`, and `SMTP_PASS`/`MAIL_PASS`.
  `SMTP_MAIL_HOST` must be the real remote SMTP hostname; an unset value must
  never fall back to localhost. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  and `TWILIO_PHONE_NUMBER` remain the SMS variables.
- Unit: `UNIT_API_TOKEN`, optional `UNIT_BASE_URL`, `UNIT_WEBHOOK_SECRET`.
- PayVessel: `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`, optional
  `PAYVESSEL_BASE_URL` (defaults to `https://sandbox.payvessel.com`), and
  `PAYVESSEL_WEBHOOK_SECRET`.
- KYC: `METAMAP_CLIENT_ID`, `METAMAP_WORKFLOW_ID`, and
  `METAMAP_WEBHOOK_SECRET` for production webhook verification.
- Notifications/profile media: optional `EXPO_PUSH_ACCESS_TOKEN`,
  `EMAIL_LOGO_URL`, `PROFILE_IMAGE_STORAGE_PROVIDER`, and `ENCRYPT_KEY`.
- SMTP delivery tuning: optional `SMTP_TLS_REJECT_UNAUTHORIZED`,
  `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS`, and
  `SMTP_SOCKET_TIMEOUT_MS`.

Password-reset and OTP delivery returns HTTP `503` with code
`EMAIL_DELIVERY_UNAVAILABLE` or `PASSWORD_RESET_EMAIL_UNAVAILABLE` when SMTP
or Resend is missing, misconfigured, or cannot be reached. The response
contains only missing variable names and provider error codes; API keys,
SMTP credentials, and provider payloads are never returned to mobile.

Example when Resend has no verified sender configured:

```json
{
  "code": "PASSWORD_RESET_EMAIL_UNAVAILABLE",
  "message": "We could not send the password reset OTP right now. Please try again later or contact support.",
  "feature": "password_reset",
  "capability": "password_reset_email_otp",
  "reason": "Email delivery is not configured on the backend.",
  "missingRequirements": [
    "RESEND_FROM_EMAIL or SMTP_MAIL_FROM or EMAIL_FROM or FROM_EMAIL"
  ],
  "provider": "Resend",
  "retryable": false
}
```

- Future providers: `FX_PROVIDER_BASE_URL`, `FX_PROVIDER_API_KEY`,
  `CRYPTO_PROVIDER`, `CRYPTO_PROVIDER_API_KEY`, `INVESTMENT_PROVIDER`,
  `INVESTMENT_PROVIDER_API_KEY`, `TAX_PROVIDER`, `TAX_PROVIDER_API_KEY`,
  `CARD_TOPUP_PROVIDER`, `CARD_TOPUP_SECRET_KEY`.

## Webhooks To Configure

- Unit.co: `POST /api/v1/webhooks/unit` with the configured Unit webhook
  signature header and `UNIT_WEBHOOK_SECRET`.
- PayVessel: `POST /api/v1/webhooks/payvessel` with the configured PayVessel
  signature header and `PAYVESSEL_WEBHOOK_SECRET`.
- MetaMap: `POST /api/v1/webhooks/kyc/metamap` with
  `x-metamap-signature` and `METAMAP_WEBHOOK_SECRET`.

## Existing database policy

The running application uses the existing Render PostgreSQL database with
`synchronize: false` and `migrationsRun: false`. Render should start the
service with `npm run start:prod`; it must not run `db:migrate` against the
existing database. The repository keeps the migration files for controlled
new-environment rollouts, but this deployment does not execute them and no
database settings or migration files were changed in this pass. The
compatibility `db:migrate` script exits without connecting to the database if
an old Render start command still invokes it.

The PostgreSQL metadata fix is limited to explicit TypeORM column types for
nullable string/date fields. It does not alter existing rows or schema.

For a read-only Render database check before enabling the new screens, run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user', 'wallet', 'token', 'auth_session', 'kyc_profile',
    'provider_operation', 'financial_transaction', 'card', 'beneficiary',
    'notification', 'notification_preference', 'notification_device',
    'support_ticket', 'dispute', 'reward_ledger_entry', 'referral_event'
  )
ORDER BY table_name;
```

This query only reads metadata. If a table used by a route is absent, that
route must remain disabled until the existing database is provisioned through
VidalPay's approved database change process; this deployment does not create
tables automatically.

## Additional Request/Response Examples

`POST /api/v1/auth/transaction-pin/validate`

```json
{ "pin": "1234" }
```

```json
{ "valid": true }
```

`GET /api/v1/wallets/usd/account-details` before Unit provisioning:

```json
{
  "accountDetails": {
    "accountName": null,
    "accountNumber": null,
    "bankName": null,
    "currency": "USD",
    "provider": "Unit.co",
    "providerStatus": "MISSING_CREDENTIALS",
    "isProvisioned": false,
    "message": "USD account details require Unit deposit-account provisioning."
  },
  "wallet": {
    "currency": "USD",
    "balance": 0,
    "accountNumber": null,
    "provider": "Unit.co"
  }
}
```

`GET /api/v1/crypto/overview` without a crypto provider:

```json
{
  "enabled": false,
  "comingSoon": true,
  "provider": null,
  "portfolio": {
    "totalValue": null,
    "currency": null,
    "positions": []
  }
}
```

`POST /api/v1/user/account/deletion` before a deletion policy exists:

```json
{ "reason": "privacy" }
```

```json
{
  "code": "ACCOUNT_DELETION_UNAVAILABLE",
  "message": "account_deletion is not available from the configured backend provider.",
  "feature": "account_deletion",
  "capability": "account_deletion",
  "reason": "Permanent account deletion requires a retention, financial-record, and provider-offboarding policy before it can be safely executed.",
  "missingRequirements": [
    "account_deletion_policy",
    "provider_offboarding_flow",
    "financial_record_retention_review"
  ],
  "provider": "VidalPay",
  "retryable": false
}
```

`GET /api/v1/user/scheduled-transfers` before scheduler support:

```json
{
  "enabled": false,
  "scheduledTransfers": [],
  "message": "Scheduled transfers are unavailable because no scheduler, debit authorization, or provider execution job is implemented."
}
```

`GET /api/v1/user/account-level`

```json
{
  "code": "EMAIL_VERIFIED",
  "rank": 1,
  "status": "LIMITED",
  "title": "Email Verified",
  "kycStatus": "NOT_STARTED",
  "emailVerified": true,
  "phoneVerified": false,
  "requirements": ["VERIFY_PHONE", "COMPLETE_KYC"],
  "capabilities": {
    "canReceive": true,
    "canTransfer": false,
    "canTagTransfer": true,
    "canBankTransfer": false
  }
}
```

`GET /api/v1/user/limits`

```json
{
  "accountLevel": {
    "code": "EMAIL_VERIFIED",
    "status": "LIMITED"
  },
  "limits": {
    "source": "BACKEND_POLICY",
    "enforcement": {
      "kycGatesEnforced": true,
      "amountLimitsEnforced": false
    },
    "outbound": {
      "tagTransfer": {
        "enabled": true,
        "perTransaction": null,
        "daily": null,
        "monthly": null,
        "enforced": false
      }
    }
  },
  "providerLimits": {
    "unit": null,
    "payvessel": null
  }
}
```

`GET /api/v1/rewards/dashboard` when no rewards have been earned:

```json
{
  "enabled": true,
  "provider": "VidalPay",
  "unit": "POINTS",
  "currency": null,
  "balance": 0,
  "availableBalance": 0,
  "pendingBalance": 0,
  "lifetimeEarned": 0,
  "lifetimeRedeemed": 0,
  "entryCount": 0,
  "redemption": {
    "enabled": false,
    "reason": "Reward redemption requires an approved redemption policy and wallet-credit workflow before points can be converted or paid out."
  },
  "history": [],
  "message": "No reward entries have been recorded for this account yet."
}
```

`POST /api/v1/referrals/invite`

```json
{
  "email": "friend@example.com",
  "idempotencyKey": "invite-2026-09-13-001"
}
```

```json
{
  "tracked": true,
  "referralCode": "VIDAL123",
  "invite": {
    "status": "INVITED",
    "reference": "invite-2026-09-13-001"
  },
  "rewardCreated": false,
  "message": "Referral invite was tracked. No earning is posted until the referred user completes the backend-defined qualifying action."
}
```

`POST /api/v1/rewards/redeem` before redemption policy exists:

```json
{
  "points": 100,
  "idempotencyKey": "reward-redeem-001"
}
```

```json
{
  "code": "PROVIDER_FLOW_NOT_LIVE_TESTED",
  "message": "rewards_redeem is not available from the configured backend provider.",
  "feature": "rewards_redeem",
  "capability": "rewards",
  "reason": "Reward ledger history is available, but redemption is blocked until VidalPay defines the points-to-value policy, approval flow, and wallet-credit journal.",
  "missingRequirements": [],
  "provider": "VidalPay",
  "retryable": false
}
```

## Test Results

- Backend build: `npm run build` passed.
- Backend tests: `npx jest --runInBand` passed with 20 suites and 79 tests,
  including SMTP configuration and password-reset delivery failure handling.
- Mobile TypeScript check: `corepack yarn tsc --noEmit --pretty false` passed.
- `npm run db:migrate` was verified to exit without connecting to PostgreSQL.
  Static checks do not replace a Render health check or provider sandbox
  transaction test.

## Mobile Notes

No provider secrets are needed in mobile. The mobile app should continue using
`/providers/status` and blocked response `code/message/reason` to decide whether
to show a feature, disable it, or explain missing provider setup.

## Regional wallet and charge policy

- A Nigerian account has NGN as its default wallet. A United States account has
  USD as its default wallet.
- Wallet and account-detail endpoints filter by the requested currency, and
  normalized user responses order the regional default wallet first.
- NGN airtime, data, and utility operations require an NGN wallet and a
  PayVessel-backed flow. USD account rails and USD cards/credit require the
  corresponding Unit.co capability.
- FX, investment, crypto, and other cross-wallet operations remain blocked
  until a real provider flow recomputes the quote/terms and records a journal.

## KYC review and push delivery

### Account progress levels and regulatory limits

`GET /user/account-level` returns `level` and `rank` from 1 through 4:

- Level 1 `ACCOUNT_CREATED`: account exists; KYC has not started.
- Level 2 `KYC_STARTED`: the MetaMap flow has started.
- Level 3 `KYC_DOCUMENTS_SUBMITTED`: at least one required section has been
  submitted or the complete profile is under review.
- Level 4 `KYC_VERIFIED`: the complete KYC decision is verified.

These are VidalPay onboarding progress levels, not CBN KYC tiers. The limits
response includes the three-tier CBN mobile-money reference ceilings, while
effective provider transactions remain gated until BVN/NIN and KYC evidence are
verified and the applicable provider and compliance controls enforce the limit.
Starting a form does not by itself grant a higher financial limit.

If the connected legacy database does not contain `financial_transaction`,
`beneficiary`, or `notification`, their list endpoints return structured
`FEATURE_STORAGE_UNAVAILABLE` responses. They do not return fabricated empty
history and do not delete or modify legacy records. A schema inventory is
required before a read-only adapter can safely expose records held under older
table names.

MetaMap must send webhooks to `POST /api/v1/webhooks/kyc/metamap` with its
official `x-signature` header. Legacy signature header aliases remain accepted.
MetaMap results update backend KYC status, capabilities, and limits; final
VidalPay admin approval updates the same source of truth and creates a KYC
notification when the required backend storage tables exist.

- `GET /api/v1/admin/kyc` and `GET /api/v1/admin/kyc/:userId` read the same
  `kyc_profile` and user state used by the mobile app.
- `POST /api/v1/admin/kyc/:userId/approve`, `/reject`, and
  `/request-information` update the KYC status, capabilities, limits, and
  dashboard response. Each review writes an audit operation and persists an
  in-app notification.
- `POST /api/v1/webhooks/kyc/metamap` maps provider statuses to
  `VERIFIED`, `REJECTED`, `FAILED`, or `UNDER_REVIEW`, verifies
  `x-metamap-signature` in production, and deduplicates events.
- Push delivery uses registered Expo device tokens only when push preference is
  enabled. The notification remains persisted if delivery is unavailable, and
  invalid Expo devices are revoked after a `DeviceNotRegistered` response.
# Legacy database read compatibility

The following authenticated reads remain usable when the connected production database predates optional feature tables. These responses do not create records or imply provider availability.

## `GET /api/v1/kyc/status`

When `kyc_profile` is absent, the endpoint reports the status already stored on the user record:

```json
{
  "status": "IN_PROGRESS",
  "region": "NG",
  "storageStatus": "LEGACY_FALLBACK",
  "persistent": false
}
```

## `GET /api/v1/cards`

When `card` storage is absent, the endpoint returns an honest empty collection:

```json
{
  "cards": [],
  "storageStatus": "LEGACY_STORAGE_UNAVAILABLE",
  "message": "No card storage exists in this legacy database. No card has been issued or fabricated."
}
```

Card issuance availability is determined by `usd_virtual_card` or `ngn_virtual_card` in `GET /api/v1/providers/status`; `card_topup` is a separate funding capability.

## `GET /api/v1/notifications/preferences`

When `notification_preference` is absent, the endpoint returns safe defaults marked as non-persistent. Clients must not allow edits while `persistent` is false.

## `GET /api/v1/notifications/devices`

When `notification_device` is absent, the endpoint returns `devices: []`, `storageStatus: "LEGACY_STORAGE_UNAVAILABLE"`, and `persistent: false`. It does not claim that device registration was saved.
