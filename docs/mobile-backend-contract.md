# VidalPay Mobile Backend Contract

Base URL: `https://vidalpay-backend-1.onrender.com/api/v1`

## Supported regions

- `NG` -> provider `FLUTTERWAVE`
- `US` -> provider `LEAD_BANK`
- unresolved or unsupported regions fail closed for provider-backed products

## `/user/me`

Returns a normalized account payload:

- `user`
  - identity/profile fields
  - `region`
  - `provider`
  - `wallet` and `wallets`
  - `capabilities`
  - `productAvailability`
  - `limits`
  - `accountRails`
  - `fundingMethods`
- top-level mirrors:
  - `region`
  - `provider`
  - `capabilities`
  - `productAvailability`
  - `limits`
  - `wallets`
  - `accountRails`
  - `fundingMethods`

Wallet rails are normalized and provider-safe:

- NG users receive Flutterwave-aligned virtual account rails on the `NGN` wallet
- US users receive Lead Bank-aligned ACH rails on the `USD` wallet
- non-primary wallets remain app-native and can still participate in internal wallet logic

Funding methods are normalized for mobile:

- `BANK_TRANSFER`
- `CARD_TOP_UP`

## `/user/security`

Returns the authenticated security summary:

- `email`
- `phoneNumber`
- `emailVerified`
- `phoneVerified`
- `authType`
- `lastLogin`
- `hasTransactionPin`
- `requiresTransactionPinSetup`
- `biometricManagedByDevice`
- `availableActions`

Protected contact-change flows:

- `POST /user/security/change-email/request`
- `POST /user/security/change-email/verify`
- `POST /user/security/change-phone/request`
- `POST /user/security/change-phone/verify`

## `/user/kyc`

Returns a normalized KYC payload:

- `region`
- `provider`
- `status`
  - `NOT_STARTED`
  - `IN_PROGRESS`
  - `SUBMITTED`
  - `UNDER_REVIEW`
  - `VERIFIED`
  - `REJECTED`
- `rawStatus`
- `isSupportedRegion`
- `blockedReason`
- `rejectionReason`
- `sections`
  - `GOVERNMENT_ID`
  - `ADDRESS`
  - `LIVENESS`
- `identity`
  - NG: `nin`, `bvn`
  - US: `ssn` or approved identity fields
  - mobile-safe address aliases including `state`
- `documents`
- `uploads`
- `capabilities`
- `productAvailability`
- `limits`

## Transfer gating

- internal transfer stays Vidal-tag based and app-native
- `POST /wallet/internal-transfer` is blocked until backend `canTransfer === true`
- `POST /wallet/external-transfer` also uses backend gating and stays provider-backed server-side

## Region-backed product endpoints

Staging-safe provider-backed endpoints now exist server-side:

- `POST /wallet/external-transfer`
- `POST /wallet/top-up/card`
- `GET /wallet/top-up/card/:reference`
- `POST /wallet/airtime`
- `POST /wallet/data`
- `POST /wallet/utilities`
- `GET /wallet/catalogs/airtime`
- `GET /wallet/catalogs/data`
- `GET /wallet/catalogs/utilities`
- `POST /wallet/utilities/validate`
- `POST /integrations/webhooks/flutterwave`
- `POST /integrations/webhooks/lead-bank`

### Card top-up

- `POST /wallet/top-up/card`
  - creates a provider-backed top-up intent
  - currently available for NG card funding through Flutterwave
  - returns a normalized provider response with `reference`, `status`, `checkoutUrl`, and `redirectUrl`

- `GET /wallet/top-up/card/:reference`
  - returns a normalized top-up confirmation payload
  - source of truth is backend provider-operation state and webhook reconciliation
  - `status` is one of:
    - `PENDING`
    - `SUCCESS`
    - `FAILED`
    - `CANCELED`
  - response includes:
    - `reference`
    - `provider`
    - `amount`
    - `currency`
    - `providerReference`
    - `externalReference`
    - `creditedAt`
    - `message`
    - `checkoutUrl`
    - `redirectUrl`

Example:

```json
{
  "reference": "VIDAL_FLW_TOPUP_wallet_user_1712580000000",
  "status": "PENDING",
  "provider": "FLUTTERWAVE",
  "amount": 5000,
  "currency": "NGN",
  "providerReference": "flw_ref_123",
  "externalReference": "9700775",
  "creditedAt": null,
  "message": "The card top-up is still pending wallet confirmation.",
  "checkoutUrl": "https://checkout.flutterwave.com/v3/hosted/pay/...",
  "redirectUrl": "https://app.vidalpay.com/validate-payment"
}
```

### NG service catalogs

To keep the frontend provider-safe and stop hardcoding routing values, the backend now exposes normalized discovery endpoints for NG services.

- `GET /wallet/catalogs/airtime`
- `GET /wallet/catalogs/data`
- `GET /wallet/catalogs/utilities`

All catalog responses are:

- region-aware and fail closed outside NG
- provider-safe
- normalized for mobile rendering
- returned with a `source` field:
  - `PROVIDER` when discovered live from Flutterwave
  - `CURATED_FALLBACK` when Flutterwave discovery is unavailable and the backend returns a safe fallback list

#### Airtime catalog

Response shape:

```json
{
  "region": "NG",
  "provider": "FLUTTERWAVE",
  "source": "PROVIDER",
  "message": null,
  "networks": [
    {
      "id": "mtn",
      "code": "MTN",
      "title": "MTN",
      "description": "Buy airtime for MTN numbers.",
      "billerCode": "BIL099",
      "itemCode": "AT099",
      "serviceCode": "BIL099:AT099:AIRTIME",
      "currency": "NGN",
      "minAmount": 50,
      "maxAmount": 50000,
      "enabled": true
    }
  ]
}
```

#### Data catalog

Response shape:

```json
{
  "region": "NG",
  "provider": "FLUTTERWAVE",
  "source": "PROVIDER",
  "message": null,
  "networks": [
    {
      "id": "mtn",
      "code": "MTN",
      "title": "MTN",
      "description": "MTN mobile data bundles.",
      "billerCode": "BIL108",
      "plans": [
        {
          "id": "mtn-md143",
          "code": "MTN_750_MB_DATA_BUNDLE",
          "title": "MTN 750 MB DATA BUNDLE",
          "description": "Mobile Number",
          "amount": 500,
          "currency": "NGN",
          "serviceCode": "BIL108:MD143:MTN 750 MB DATA BUNDLE",
          "billerCode": "BIL108",
          "itemCode": "MD143",
          "type": "MTN 750 MB DATA BUNDLE",
          "enabled": true
        }
      ]
    }
  ]
}
```

#### Utilities catalog

Response shape:

```json
{
  "region": "NG",
  "provider": "FLUTTERWAVE",
  "source": "PROVIDER",
  "message": null,
  "categories": [
    {
      "id": "electricity",
      "code": "ELECTRICITY",
      "title": "Electricity",
      "description": "Pay prepaid and postpaid electricity bills.",
      "providers": [
        {
          "id": "ikeja-electric",
          "code": "IKEDC",
          "title": "Ikeja Electric",
          "description": "Ikeja Electric bill payments.",
          "billerCode": "BIL113",
          "itemCode": "PWR101",
          "type": "POWER",
          "requiresValidation": true,
          "customerReferenceLabel": "Meter Number",
          "currency": "NGN",
          "enabled": true,
          "items": [
            {
              "id": "ikeja-electric-pwr101",
              "code": "IKEDC_PREPAID_TOPUP",
              "title": "IKEDC PREPAID TOPUP",
              "description": "Meter Number",
              "amount": 1000,
              "currency": "NGN",
              "serviceCode": "BIL113:PWR101:IKEDC PREPAID TOPUP",
              "billerCode": "BIL113",
              "itemCode": "PWR101",
              "type": "IKEDC PREPAID TOPUP",
              "requiresValidation": true,
              "customerReferenceLabel": "Meter Number",
              "enabled": true
            }
          ]
        }
      ]
    }
  ]
}
```

### Utility customer validation

- `POST /wallet/utilities/validate`
  - validates a utility customer reference when provider validation is available
  - supports:
    - `serviceCode`
    - or explicit `billerCode` / `itemCode`
  - always returns a normalized mobile-safe payload

Request:

```json
{
  "customerReference": "1234567890",
  "serviceCode": "BIL113:PWR101:IKEDC PREPAID TOPUP",
  "providerCode": "IKEDC",
  "providerTitle": "Ikeja Electric"
}
```

Response:

```json
{
  "valid": true,
  "validationAvailable": true,
  "resolvedName": "John Doe",
  "customerReference": "1234567890",
  "provider": {
    "code": "IKEDC",
    "title": "Ikeja Electric",
    "billerCode": "BIL113",
    "itemCode": "PWR101",
    "type": "IKEDC PREPAID TOPUP"
  },
  "fee": 0,
  "minimumAmount": 0,
  "maximumAmount": 0,
  "currency": "NGN",
  "message": "Customer validated"
}
```

If provider validation is unavailable, the route still responds with a normalized graceful payload and `validationAvailable: false` so mobile can degrade cleanly without hardcoding provider logic.

### NG / Flutterwave payload notes

- `POST /wallet/external-transfer`
  - `destinationRoutingNumber` should carry the destination bank code for NG transfers.
  - `metadata.bankCode` is also accepted as a fallback.
- `POST /wallet/airtime`
  - `serviceCode` can be supplied as `billerCode:itemCode[:type]`.
  - `metadata.billerCode` and `metadata.itemCode` are still accepted as a fallback.
- `POST /wallet/data`
  - `serviceCode` can be passed as `billerCode:itemCode[:type]`, or the same values can be supplied in metadata.
- `POST /wallet/utilities`
  - `serviceCode` can be passed as `billerCode:itemCode[:type]`, or the same values can be supplied in metadata.

## Provider boundaries

- KYC remains behind KYC adapters
- rails, card top-up, external transfers, airtime, data, utilities, webhook processing, and reconciliation remain behind provider adapters
- tax and loan provider boundaries are intentionally left abstract for later provider selection

## Support, legal, and crypto

The backend now exposes in-app parity routes for these Figma surfaces:

- `GET /support/overview`
- `GET /support/faqs`
- `GET /support/tickets`
- `POST /support/tickets`
- `GET /legal/overview`
- `GET /legal/documents`
- `GET /legal/documents/:slug`
- `GET /crypto/overview`
- `GET /crypto/assets`

Current staging behavior:

- support tickets are persisted server-side
- legal content is delivered as normalized static backend content
- crypto surfaces are explicitly marked as coming soon and remain disabled
