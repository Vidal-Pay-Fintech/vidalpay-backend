# VidalPay sandbox endpoints implemented

Base backend URL: `https://vidalpay-backend-1.onrender.com/api/v1`

All mobile routes below require a VidalPay bearer access token. Financial mutations also require a valid backend transaction PIN and an idempotency key. Provider credentials remain on the backend.

## NGN cards with Sudo

| Mobile route           | Provider request                             | State                                                                                 |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /cards`           | Database read                                | Implemented                                                                           |
| `POST /cards/virtual`  | `POST https://api.sandbox.sudo.africa/cards` | Implemented; requires credentials and provider IDs                                    |
| `POST /cards/physical` | `POST https://api.sandbox.sudo.africa/cards` | Implemented; requires credentials, provider IDs, and an enabled physical-card program |

Request example:

```json
{
  "currency": "NGN",
  "cardholderId": "sudo_cardholder_id",
  "fundingSourceId": "sudo_funding_source_id",
  "cardProgramId": "optional_override",
  "transactionPin": "1234",
  "idempotencyKey": "card-user-request-0001",
  "billingAddress": {
    "line1": "Provider-validated address",
    "city": "Lagos",
    "country": "NG"
  }
}
```

Successful response uses the normalized VidalPay card contract. The backend stores only masked card data returned by the provider. Full PAN and CVV are not returned by these routes.

If credentials or provider mappings are missing, the route returns HTTP 503 with the structured unavailable contract. If Sudo declines or times out, the provider operation is persisted as `FAILED`; the NGN wallet is not debited.

USD card creation remains blocked until Unit customer, account, and card mappings are implemented and sandbox-tested.

## Reloadly fallback for Nigerian services

| Mobile route                      | Reloadly sandbox request                           | State                |
| --------------------------------- | -------------------------------------------------- | -------------------- |
| `GET /wallet/catalogs/airtime`    | `GET /operators/countries/NG?includeBundles=false` | Implemented fallback |
| `GET /wallet/catalogs/data`       | `GET /operators/countries/NG?includeBundles=true`  | Implemented fallback |
| `GET /wallet/catalogs/utilities`  | `GET /billers/countries/NG`                        | Implemented fallback |
| `POST /wallet/utilities/validate` | `POST /accounts/validate`                          | Implemented fallback |
| `POST /wallet/airtime`            | `POST /topups`                                     | Implemented fallback |
| `POST /wallet/data`               | `POST /topups`                                     | Implemented fallback |
| `POST /wallet/utilities`          | `POST /pay`                                        | Implemented fallback |

Reloadly OAuth request:

```http
POST https://auth.reloadly.com/oauth/token
Content-Type: application/json

{
  "client_id": "backend environment value",
  "client_secret": "backend environment value",
  "grant_type": "client_credentials",
  "audience": "https://topups-sandbox.reloadly.com"
}
```

Purchase requests require:

```json
{
  "currency": "NGN",
  "amount": 1000,
  "transactionPin": "1234",
  "idempotencyKey": "airtime-user-request-0001",
  "operatorId": 1,
  "recipientPhone": {
    "countryCode": "NG",
    "number": "+2348000000000"
  }
}
```

The backend removes the transaction PIN before sending the request to Reloadly. A provider operation is written as `PENDING` before the external request and updated to `SUBMITTED` or `FAILED`. `SUBMITTED` does not mean settled. Wallet debit and settlement must be completed by a verified status/reconciliation flow before this can be production-ready.

## Render sandbox environment variables

Do not place these values in the mobile application.

```text
SUDO_API_KEY
SUDO_CARD_PROGRAM_ID
SUDO_BASE_URL=https://api.sandbox.sudo.africa

RELOADLY_CLIENT_ID
RELOADLY_CLIENT_SECRET
RELOADLY_AUTH_URL=https://auth.reloadly.com
RELOADLY_AIRTIME_BASE_URL=https://topups-sandbox.reloadly.com
RELOADLY_UTILITIES_BASE_URL=https://utilities-sandbox.reloadly.com
RELOADLY_AIRTIME_AUDIENCE=https://topups-sandbox.reloadly.com
RELOADLY_UTILITIES_AUDIENCE=https://utilities-sandbox.reloadly.com
```

Optional path overrides are available if the enabled Reloadly product version uses different paths:

```text
RELOADLY_AIRTIME_CATALOG_PATH
RELOADLY_DATA_CATALOG_PATH
RELOADLY_UTILITIES_CATALOG_PATH
RELOADLY_UTILITIES_VALIDATE_PATH
RELOADLY_TOPUP_PATH
RELOADLY_UTILITIES_PAYMENT_PATH
```

Malformed or non-HTTPS provider base URLs are rejected in favor of the official sandbox defaults.

## Existing Render variable compatibility

Provider status now recognizes:

- `VERTO_BASE_URL` and `VERTO_API_KEY` as an FX configuration option.
- `ZERO_HASH_API_KEY` for crypto readiness.
- `ALPACA_BROKER_API_KEY` and `ALPACA_BROKER_API_SECRET` for investment readiness.
- PayVessel or Reloadly credentials for bill-service readiness.

Configuration alone produces `CONFIGURED_NOT_LIVE_TESTED`. It never produces `READY` for an external provider.

## Deliberately unavailable

- Unit USD account/card execution until valid sandbox credentials and provider mappings exist.
- FX conversion until an executable NGN/USD sandbox quote and conversion are confirmed.
- Zero Hash crypto mutations until Cert access, request signing, and IP allowlisting are implemented.
- Alpaca customer investment orders until Broker API partner access is issued.
- Unit loans and April Tax until contractual sandbox support is supplied.

## Required end-to-end evidence

1. Authenticated provider call with redacted evidence.
2. Provider-created sandbox object appears in its dashboard.
3. VidalPay operation and normalized object are persisted.
4. Duplicate idempotency key does not repeat the provider mutation.
5. Provider decline and timeout remain failed/pending without wallet debit.
6. Webhook or polling confirms final state.
7. NGN and USD wallet data remain isolated.
8. Mobile renders success, pending, failure, and unavailable responses correctly.
