# VidalPay Sandbox Provider Selection and Readiness

## Executive decision

The deployed API is reachable, but the financial feature surface is not 100% functional. Public reachability, configured environment variables, authenticated sandbox success, persisted operations, webhook completion, and mobile rendering are separate readiness gates. No financial capability should be labelled ready until all six have evidence.

Recommended sandbox provider map:

| Capability | Primary sandbox | Fallback | Decision |
|---|---|---|---|
| USD account and transfer rails | Unit | Increase | Keep Unit; do not add a second USD ledger until Unit onboarding is tested |
| USD virtual and physical cards | Unit | Increase or Stripe Issuing | Keep Unit as primary |
| NGN wallet, virtual account, transfers | PayVessel | Provider procurement required | Keep PayVessel, but obtain sandbox credentials first |
| NGN virtual and physical cards | Sudo | Bridgecard | Add Sudo only after sandbox account and card program are available |
| Nigerian customer USD virtual card | PayVessel | Unit for eligible US customers | PayVessel supports USD virtual cards, not NGN cards |
| Airtime and data | PayVessel | Reloadly | Add Reloadly as an explicit fallback adapter |
| Utilities | PayVessel | Reloadly Utilities | Add Reloadly as an explicit fallback adapter |
| NGN/USD FX quote and conversion | Existing Verto relationship, if valid | Currencycloud Demo after pair validation | Keep unavailable until an authenticated NGN/USD sandbox quote succeeds |
| KYC | MetaMap | Persona sandbox | Keep MetaMap; Persona is contingency only |
| Crypto | Zero Hash Cert | none selected | Implement only after Zero Hash provisions Cert access |
| End-user investments | Alpaca Broker API Sandbox | none selected | A normal Alpaca paper account is not a multi-user brokerage integration |
| Loans | Unit credit if contractually enabled | none selected | Keep unavailable; no provider-backed loan origination sandbox is approved |
| US tax filing | April Tax partner integration | none selected | Keep unavailable until genuine April Tax partner documentation and sandbox access are supplied |
| Fraud/risk | Sardine sandbox | provider rules internal | Integrate as a risk decision input, never as the transaction ledger |
| Email | Resend | SMTP only when fully configured | Resend is the configured primary |
| Push | Expo Push Service | none selected | Requires persistent device registration and receipt processing |
| Rewards, referrals, QR, requests, support | VidalPay database | none | Internal workflows; external providers do not replace missing storage |

## Current deployed reachability

Unauthenticated probes on 2026-09-14 produced:

| URL | Result | Meaning |
|---|---:|---|
| `https://vidalpay-backend-1.onrender.com/` | 404 JSON | Render service and Nest application are reachable; no root route is exposed |
| `https://vidalpay-backend-1.onrender.com/api/v1/providers/status` | 401 JSON | Route is reachable and protected; an authenticated mobile token is required |
| `https://api.s.unit.sh/` | 200 | Unit sandbox host resolves |
| `https://sandbox.payvessel.com/` | not authenticated in this audit | Must be tested with PayVessel sandbox credentials |
| `https://api.payvessel.com/` | 503 | Production host was unavailable during the probe; production is outside this phase |
| `https://sandbox.increase.com/` | 401 | Sandbox host resolves and requires authentication |
| `https://paper-api.alpaca.markets/v2/account` | 401 | Paper host resolves and requires paper credentials |
| `https://auth.reloadly.com/oauth/token` | 401 for GET | Auth host resolves; the real flow is authenticated `POST` |

These results are connectivity evidence only. They are not authenticated provider tests.

## Render environment-name cross-check

Values are intentionally omitted. The comparison uses variable names only.

| Domain | Backend currently reads | Render metadata previously supplied | Result |
|---|---|---|---|
| Unit | `UNIT_BASE_URL`, `UNIT_API_TOKEN`, `UNIT_WEBHOOK_SECRET` | names present | Token was described as a placeholder; not testable as configured |
| PayVessel | `PAYVESSEL_BASE_URL`, `PAYVESSEL_API_KEY`, `PAYVESSEL_API_SECRET`, `PAYVESSEL_WEBHOOK_SECRET` | names absent | unavailable |
| FX | `FX_PROVIDER_BASE_URL`, `FX_PROVIDER_API_KEY` | `FX_PROVIDER_MODE` and `VERTO_*` names present | mismatch; backend ignores the Verto variables |
| Crypto | `CRYPTO_PROVIDER`, `CRYPTO_PROVIDER_API_KEY` | `CRYPTO_PROVIDER_MODE` and `ZERO_HASH_*` names present | mismatch; backend ignores the Zero Hash variables |
| Investments | `INVESTMENT_PROVIDER`, `INVESTMENT_PROVIDER_API_KEY` | `INVESTMENT_PROVIDER_MODE` and legacy provider names present | mismatch; no provider client exists |
| Tax | `TAX_PROVIDER`, `TAX_PROVIDER_API_KEY` | `TAX_PROVIDER_MODE` and `APRIL_*` names present | mismatch; no April Tax client exists |
| KYC | `METAMAP_CLIENT_ID`, `METAMAP_WORKFLOW_ID`, `METAMAP_WEBHOOK_SECRET` | names present | configuration-shaped only; database and webhook round trip remain unverified |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME` | names present | correctly named; authenticated send evidence is still required |
| Push | `EXPO_PUSH_ACCESS_TOKEN` optionally, plus notification-device storage | provider mode present; access-token name not observed | Expo may accept uncredentialed sends, but device storage is currently the blocker |

Several supplied `*_BASE_URL` values were not URL-shaped. They cannot be treated as endpoints. Secret values previously shared must not be copied into source, logs, documentation, or mobile code.

## Provider findings

### Unit

- Sandbox base: `https://api.s.unit.sh`.
- Virtual card creation: `POST /cards` with `individualVirtualDebitCard`.
- Physical card creation uses the Unit card resource for an eligible customer/account.
- Requires an approved Unit application/customer, deposit account, token scopes, idempotency, and webhooks.
- Current VidalPay card creation does not call Unit and always blocks.

### PayVessel

- Sandbox base: `https://sandbox.payvessel.com`.
- Authentication headers: `api-key`, `api-secret`.
- Official issuing documentation creates asynchronous **USD virtual cards** for Nigerian customers.
- It requires Nigerian phone data, BVN, NIN, date of birth, identity image, and Nigerian address.
- Card status must be polled or completed from webhooks.
- The documentation includes get/list/fund/withdraw/transactions/simulate/freeze/unfreeze/terminate flows.
- It does not establish NGN-denominated card issuance.

### Sudo

- Sandbox base: `https://api.sandbox.sudo.africa`.
- Supports NGN card programs and virtual or physical card creation.
- Requires a sandbox account, API key, settlement account, funding source, cardholder, and card program.
- Recommended NGN card provider because the sandbox and currency are explicit in official documentation.

### Reloadly

- OAuth token endpoint: `POST https://auth.reloadly.com/oauth/token`.
- Airtime sandbox: `https://topups-sandbox.reloadly.com`.
- Utility sandbox: `https://utilities-sandbox.reloadly.com`.
- Supports operator lookup, airtime, and data bundle testing; utility payments use a separate audience.
- Recommended only as fallback. Provider selection must be persisted on every operation for reconciliation.

### Currencycloud

- Provides a Demo API with non-live conversion execution.
- Candidate for FX contract testing only after the account confirms both required currencies and an authenticated NGN/USD quote.
- Do not substitute indicative rates for executable conversion or debit wallets without a confirmed conversion response.

### Zero Hash

- Cert host for US integrations: `https://api.cert.zerohash.com`.
- Cert access is provisioned by Zero Hash after commercial contact.
- Uses signed authenticated requests. Existing variable names do not match the backend status service and no Zero Hash client exists.

### Alpaca

- End-user investment accounts require Broker API Sandbox: `https://broker-api.sandbox.alpaca.markets`.
- Account creation: `POST /v1/accounts`.
- End-user orders: `POST /v1/trading/accounts/{account_id}/orders`.
- Requires approval as a broker partner/correspondent. A personal paper-trading key must not be used to fabricate separate customer portfolios.

### Tax and lending

- The public `meetapril.io` API found during research is an Australian commerce/payment platform and is not evidence of an April US tax-filing integration.
- The April Tax integration requires partner-provided documentation and credentials. Tax submission remains unavailable.
- No substitute loan provider is approved. Eligibility, APR, offer, approval, disbursement, and repayment must remain unavailable until a contracted lender exposes a sandbox flow.

## Implementation order after approval

1. Correct provider configuration aliases and add startup validation without changing database connection settings.
2. Add authenticated provider health checks that redact secrets and record last successful test time.
3. Complete MetaMap status/webhook persistence and Expo device persistence after the legacy-table inventory.
4. Implement PayVessel NGN account/transfers and bill catalogs with idempotent provider operations.
5. Implement Unit USD customer/account/card flows.
6. Add Reloadly fallback for airtime, data, and utilities.
7. Add Sudo NGN cards.
8. Add Zero Hash Cert and Alpaca Broker Sandbox only after partner credentials are issued.
9. Keep loans and tax submission blocked until contracted provider access exists.
10. Execute end-to-end sandbox tests, including webhook replay, duplicate idempotency keys, provider timeout, decline, reconciliation, and NGN/USD isolation.

## Credentials required before implementation can be called functional

- PayVessel sandbox API key, API secret, webhook secret, and enabled products.
- Unit valid sandbox token with applications, customers, accounts, cards, and webhook scopes.
- Sudo sandbox API key and NGN card program/funding-source identifiers.
- Reloadly test client ID and client secret for Airtime and Utilities audiences.
- Zero Hash Cert platform credentials and IP allowlisting.
- Alpaca Broker Sandbox correspondent credentials, not personal paper credentials.
- Genuine April Tax partner sandbox credentials and API specification.
- Sardine sandbox client ID and client secret if risk decisions are enabled.

## Sources

1. Unit, [Using the API](https://www.unit.co/docs/api/using-the-api/).
2. Unit, [Quickstart](https://www.unit.co/docs/api/quickstart/).
3. Unit, [Cards](https://www.unit.co/docs/api/cards/).
4. PayVessel, [Authentication and environments](https://docs.payvessel.com/api-basics/authentication).
5. PayVessel, [Create a Card](https://docs.payvessel.com/virtual-cards/create-customer-card).
6. PayVessel, [Simulate Card Transaction](https://docs.payvessel.com/virtual-cards/mock-transaction).
7. Sudo, [Sandbox onboarding](https://docs.sudo.africa/docs/onboarding).
8. Sudo, [Authentication](https://docs.sudo.africa/docs/authentication).
9. Sudo, [Create Card](https://docs.sudo.africa/reference/create-card).
10. Reloadly, [Sandbox](https://developers.reloadly.com/developer-tools/sandbox).
11. Reloadly, [Products Quickstart](https://developers.reloadly.com/developer-tools/get-started/products-quickstart).
12. Currencycloud, [Getting started with the Demo API](https://developer.currencycloud.com/guides/getting-started/getting-started-with-the-api/).
13. Zero Hash, [Getting Started](https://docs.zerohash.com/docs/getting-started).
14. Zero Hash, [Get Platform Access](https://docs.zerohash.com/docs/get-platform-access).
15. Alpaca, [Getting Started with Broker API](https://docs.alpaca.markets/us/docs/getting-started-with-broker-api).
16. Alpaca, [Broker API Authentication](https://docs.alpaca.markets/us/docs/authentication).
17. Persona, [API Keys and Sandbox](https://docs.withpersona.com/api-keys).
18. Increase, [Sandbox](https://increase.com/documentation/sandbox).
19. Stripe, [Test an Issuing integration](https://docs.stripe.com/issuing/testing).
20. Sardine, [Documentation](https://docs.sardine.ai/home).
