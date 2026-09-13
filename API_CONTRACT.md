# VidalPay Backend Mobile Contract

This backend exposes the mobile app routes under `/api/v1` through Nest URI
versioning. Every mobile-visible provider feature either returns real backend
state, calls a provider only when backend sandbox credentials are configured, or
returns a structured unavailable response.

## Inventory

- Framework/runtime: NestJS 11 on Node.js/TypeScript.
- Database/ORM: MySQL through TypeORM. Runtime and migration config supports a
  MySQL `DATABASE_URL` plus `DB_SSL`/`DB_CONNECT_TIMEOUT_MS`, or the legacy
  `MYSQL_*` variables. The repository currently has `synchronize: true`; this
  pass also adds migrations for the new mobile contract tables and columns.
- Auth: JWT bearer access tokens, rotating refresh tokens, and persisted
  revocable session families in `auth_session`.
- Jobs/queues: none found.
- Existing providers before this pass: email through SMTP/nodemailer, SMS
  helper through Twilio, Google OAuth strategy. No Unit.co, PayVessel, FX,
  crypto, investment, loan, card, or bill-payment module existed.
- Webhooks before this pass: none found.
- API modules before this pass: auth, user scaffold, wallet scaffold, database
  scaffold, mail, tokens.
- Test setup: Jest/ts-jest unit tests under `src/**/*.spec.ts`; e2e config in
  `test/jest-e2e.json`.
- API docs: Swagger is mounted at `/api-docs`.

## Mobile Contract Matrix

| Feature | Mobile Expected Endpoint | Backend Exists? | Handler | Service | DB Model | Provider Connected? | Functional? | Missing Work |
|---|---|---:|---|---|---|---|---|---|
| Signup | POST `/auth/sign-up` | Yes | `AuthenticationController` | `AuthenticationService` | `user`, `wallet`, `auth_session` | Internal | Yes | SMTP delivery must be configured |
| Login | POST `/auth/login` | Yes | `AuthenticationController` | `AuthenticationService` | `user`, `auth_session` | Internal | Yes | None |
| Logout | POST `/auth/logout` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Logout all | POST `/auth/logout-all` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Refresh | POST `/auth/refresh-token` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Session check | GET `/auth/me` | Yes | `AuthenticationController` | `AuthenticationService` | `user` | Internal | Yes | None |
| Reauth | POST `/auth/reauth` | Yes | `AuthenticationController` | `AuthenticationService` | `user` | Internal | Yes | None |
| Sessions | GET `/auth/sessions` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Revoke session | POST `/auth/sessions/:familyId/revoke` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Revoke others | POST `/auth/sessions/revoke-others` | Yes | `AuthenticationController` | `AuthenticationService` | `auth_session` | Internal | Yes | None |
| Email OTP | POST `/auth/verify-email`, POST `/auth/resend-otp` | Yes | `AuthenticationController` | `AuthenticationService` | `token` | SMTP | Yes | SMTP env required for delivery |
| Transaction PIN | POST `/auth/transaction-pin/request`, `/verify`, `/set`, `/validate` | Yes | `AuthenticationController` | `AuthenticationService` | `token`, `user` | Internal/SMTP | Yes | SMTP env required for OTP delivery |
| Password reset | POST `/auth/password-reset/request`, `/verify-otp`, `/complete` | Yes | `AuthenticationController` | `AuthenticationService` | `token`, `user` | SMTP | Yes | SMTP env required for delivery |
| User profile/account level | GET `/user/me`, GET `/user/home`, GET `/user/security`, GET `/user/account-level`, GET `/user/limits`, PATCH `/user/profile` | Yes | `UserController` | `VidalpayService` | `user`, `wallet`, `kyc_profile` | Internal | Yes | Provider-specific limits require provider provisioning |
| Contact changes | POST `/user/security/change-email/*`, `/change-phone/*` | Yes | `UserController` | `VidalpayService` | `user`, `token` | SMTP | Yes | Phone OTP is delivered by email until SMS copy is added |
| Account closure/deletion | POST `/user/account/closure`, POST `/user/account/deletion` | Yes | `UserController` | `VidalpayService` | `user` | Internal | Closure works; permanent deletion blocked | Add retention/provider-offboarding policy before hard deletion |
| Scheduled transfers | GET/POST `/user/scheduled-transfers` | Yes | `UserController` | `VidalpayService` | `provider_operation` | Scheduler/provider jobs required | Listing disabled; create blocked | Add durable scheduler, retry, and PIN authorization jobs |
| KYC | POST `/kyc/start`, GET `/kyc/status`, POST `/user/kyc/*` | Yes | `KycController`, `UserController` | `VidalpayService` | `kyc_profile` | MetaMap if env exists | Partial | Configure MetaMap env and webhook |
| Wallets | GET `/wallets`, `/wallets/ngn`, `/wallets/usd` | Yes | `WalletsController` | `VidalpayService` | `wallet` | Internal ledger | Yes | Provider account provisioning |
| Account details | GET `/wallets/ngn/account-details`, `/wallets/usd/account-details` | Yes | `WalletsController` | `VidalpayService` | `wallet` | PayVessel/Unit when provisioned | Partial | Configure and live-test provider provisioning |
| Wallet transactions | GET `/wallets/transactions`, `/wallets/ngn/transactions`, `/wallets/usd/transactions`, `/wallet/transactions` | Yes | `WalletsController`, `WalletController` | `VidalpayService` | `financial_transaction` | Internal | Yes | Provider transaction sync jobs |
| TAG transfer | POST `/transfers/internal` | Yes | `TransfersController` | `VidalpayService` | `wallet`, `provider_operation`, `financial_transaction` | Internal ledger | Yes | Add fraud/risk limits |
| External transfer | POST `/wallet/external-transfer`, `/resolve`, GET `/wallet/catalogs/banks` | Yes | `WalletController` | `VidalpayService` | `provider_operation` | PayVessel/Unit required | Blocked | Configure provider rails and webhooks |
| Transactions | GET `/transaction/me`, `/:id`, `/:id/receipt`, `/me/statement` | Yes | `TransactionController` | `VidalpayService` | `financial_transaction` | Internal | Yes | PDF/CSV export if required |
| Deposits | POST `/wallet/top-up/card`, GET `/wallet/top-up/card/:reference` | Yes | `WalletController` | `VidalpayService` | `provider_operation` | Payment provider required | Blocked | Configure processor and webhook |
| FX | GET `/fx/quotes`, POST `/fx/convert` | Yes | `FxController` | `VidalpayService` | `provider_operation` | FX provider required | Blocked | Choose/configure FX provider |
| Cards | GET `/cards`, POST `/cards/virtual`, `/physical`, card lifecycle routes | Yes | `CardsController` | `VidalpayService` | `card`, `provider_operation` | Unit/PayVessel required | Listing works; mutations blocked | Provider customer/card mapping |
| Bills | GET `/wallet/catalogs/airtime`, `/data`, `/utilities`; POST purchase/validate routes | Yes | `WalletController` | `VidalpayService` | `provider_operation` | PayVessel required | Catalog empty/unavailable; mutations blocked | Configure PayVessel biller APIs |
| Notifications | GET/POST `/notifications*` | Yes | `NotificationsController` | `VidalpayService` | `notification*` | Internal | Yes | Push delivery worker |
| Support/disputes/legal | `/support/*`, POST `/disputes`, `/legal/*` | Yes | Support, Disputes, Legal controllers | `VidalpayService` | `support_ticket`, `dispute` | Internal intake | Yes | Provider dispute submission if needed |
| Crypto | GET `/crypto/overview`, `/assets` | Yes | `CryptoController` | `VidalpayService` | none | Provider required | Honest disabled response with null portfolio values | Select provider |
| Investments | GET `/investments/*`, POST `/investments/account`, `/orders` | Yes | `InvestmentsController` | `VidalpayService` | `provider_operation` | Provider required | Reads disabled with null portfolio values; mutations blocked | Select provider |
| Loans | GET/POST `/loans/*` | Yes | `LoansController` | `VidalpayService` | `provider_operation` | Unit credit required | Reads disabled; mutations blocked | Unit credit program setup |
| Tax | GET `/tax/status`, `/tax/overview`, POST `/tax/filings` | Yes | `TaxController` | `VidalpayService` | `provider_operation` | Tax provider required | Reads disabled with null counts; filing blocked | Select provider/legal flow |
| Rewards/referrals | GET/POST `/rewards/*`, `/referrals/*` | Yes | Rewards, Referrals controllers | `VidalpayService` | `user`, `reward_ledger_entry`, `referral_event`, `provider_operation` | Internal | Ledger/history and invite tracking work; redemption blocked | Define reward redemption policy and wallet-credit journal |
| QR/money requests | `/qr/*`, `/money-requests/*` | Yes | QR, MoneyRequests controllers | `VidalpayService` | `provider_operation` | Internal/provider flow required | Blocked/unimplemented | Define QR payload and request ledgers |
| Provider status | GET `/providers/status` | Yes | `ProvidersController` | `ProviderStatusService` | none | Env-aware | Yes | Live sandbox probes |

## Provider Research Matrix

| Provider | Capability | Sandbox Available? | Official Docs URL | API Endpoint | Required Credentials | Webhook Needed? | Supported Now? | Notes |
|---|---|---:|---|---|---|---:|---|---|
| Unit.co | USD wallet/account rails | Yes | https://www.unit.co/docs/api/accounts/deposit-accounts/overview/ | `/accounts`, `/applications` | `UNIT_API_TOKEN`, customer/application data | Yes | Not live-tested | Backend returns local wallet and blocks account provisioning until credentials and customer mapping exist |
| Unit.co | USD virtual cards | Yes | https://www.unit.co/docs/api/cards/api/ | `/cards` with virtual debit card types | `UNIT_API_TOKEN`, customer/account/card program | Yes | Blocked | Official docs include individual/business virtual debit card creation |
| Unit.co | USD physical cards | Yes | https://www.unit.co/docs/api/cards/api/ | `/cards` with physical debit card types | `UNIT_API_TOKEN`, customer/account/card program, shipping address | Yes | Blocked | Supported by Unit card API but not wired to a VidalPay provider customer yet |
| Unit.co | Card lifecycle | Yes | https://www.unit.co/docs/api/cards/api/ | freeze/unfreeze/close card actions | `UNIT_API_TOKEN`, provider card id | Yes | Blocked | No local full PAN/CVV storage added |
| Unit.co | Loans/credit | Yes | https://www.unit.co/docs/api/credit-accounts/overview/ | credit account APIs | `UNIT_API_TOKEN`, credit program setup | Yes | Blocked | No APR/offers are fabricated |
| PayVessel | NGN virtual accounts | Yes | https://docs.payvessel.com/api-reference/virtual-accounts/create-virtual-account | virtual account API | `PAYVESSEL_SECRET_KEY`, `PAYVESSEL_BUSINESS_ID` | Yes | Blocked | No account number is generated locally |
| PayVessel | NGN transfers | Yes | https://docs.payvessel.com/api-reference/transfers/initiate-transfer | transfer API | `PAYVESSEL_SECRET_KEY`, `PAYVESSEL_BUSINESS_ID` | Yes | Blocked | External debits are blocked until provider execution is configured |
| PayVessel | Virtual cards | Yes | https://docs.payvessel.com/api-reference/virtual-cards/create-customer-card | virtual card API | `PAYVESSEL_SECRET_KEY`, `PAYVESSEL_BUSINESS_ID` | Yes | Unsupported for NGN | Docs reviewed describe card issuing, but NGN card support was not confirmed |
| PayVessel | Airtime/data/utilities | Yes | https://docs.payvessel.com/api-reference/biller-reseller/create-order | biller reseller order API | `PAYVESSEL_SECRET_KEY`, `PAYVESSEL_BUSINESS_ID` | Yes | Blocked | Catalogs return empty/unavailable until provider catalog calls are live-tested |
| FX provider | Quotes/conversion | No provider found in repo | N/A | N/A | `FX_PROVIDER_BASE_URL`, `FX_PROVIDER_API_KEY` | Depends on provider | Blocked | Backend does not invent rates |
| Crypto provider | Overview/assets/deposit/withdrawal | No provider found in repo | N/A | N/A | `CRYPTO_PROVIDER`, `CRYPTO_PROVIDER_API_KEY` | Yes | Blocked | Overview/assets return honest disabled state with null values, not fabricated positions |
| Investment provider | Products/orders | No provider found in repo | N/A | N/A | `INVESTMENT_PROVIDER`, `INVESTMENT_PROVIDER_API_KEY` | Yes | Blocked | No products or portfolio values are fabricated |

## Structured Responses

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
  "missingRequirements": ["PAYVESSEL_SECRET_KEY", "PAYVESSEL_BUSINESS_ID"],
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

- Database: preferred Render-compatible MySQL `DATABASE_URL`, optional
  `DB_SSL`, optional `DB_CONNECT_TIMEOUT_MS`; alternatively `MYSQL_HOST`,
  `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`.
- JWT: `JWT_SECRET`, `JWT_TOKEN_AUDIENCE`, `JWT_TOKEN_ISSUER`,
  `JWT_ACCESS_TOKEN_TTL`, `JWT_REFRESH_TOKEN_TTL`. The legacy
  `JWT_ACCESS_TOKEN_TtL` spelling is still accepted as a fallback.
- Email/SMS: `SMTP_MAIL_HOST`, `SMTP_MAIL_PORT`, `SMTP_MAIL_USERNAME`,
  `SMTP_MAIL_PASSWORD`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_PHONE_NUMBER`.
- Unit: `UNIT_API_TOKEN`, optional `UNIT_BASE_URL`, `UNIT_WEBHOOK_SECRET`.
- PayVessel: `PAYVESSEL_SECRET_KEY`, `PAYVESSEL_API_KEY`,
  `PAYVESSEL_BUSINESS_ID`, optional `PAYVESSEL_BASE_URL`,
  `PAYVESSEL_WEBHOOK_SECRET`.
- KYC: `METAMAP_CLIENT_ID`, `METAMAP_WORKFLOW_ID`.
- Future providers: `FX_PROVIDER_BASE_URL`, `FX_PROVIDER_API_KEY`,
  `CRYPTO_PROVIDER`, `CRYPTO_PROVIDER_API_KEY`, `INVESTMENT_PROVIDER`,
  `INVESTMENT_PROVIDER_API_KEY`, `TAX_PROVIDER`, `TAX_PROVIDER_API_KEY`,
  `CARD_TOPUP_PROVIDER`, `CARD_TOPUP_SECRET_KEY`.

## Webhooks To Configure

- Unit.co: `POST /api/v1/webhooks/unit`
- PayVessel: `POST /api/v1/webhooks/payvessel`
- MetaMap: `POST /api/v1/webhooks/kyc/metamap`

## Database Migration Added

- `src/database/migrations/1788998400000-MobileContractSchema.ts` adds the
  mobile contract tables and columns: `auth_session`, `kyc_profile`,
  `provider_operation`, `financial_transaction`, `card`, `beneficiary`,
  `notification`, `notification_preference`, `notification_device`,
  `support_ticket`, `dispute`, plus additional provider/user columns on
  `wallet` and `user`.
- `src/database/migrations/1789084800000-RewardsReferralsSchema.ts` adds
  `reward_ledger_entry` and `referral_event` for real rewards/referral history.

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

- `corepack pnpm exec tsc --noEmit`
- `corepack pnpm exec nest build`
- `corepack pnpm exec jest --runInBand`
- Final Jest result: 17 suites passed, 56 tests passed.

## Mobile Notes

No provider secrets are needed in mobile. The mobile app should continue using
`/providers/status` and blocked response `code/message/reason` to decide whether
to show a feature, disable it, or explain missing provider setup.
