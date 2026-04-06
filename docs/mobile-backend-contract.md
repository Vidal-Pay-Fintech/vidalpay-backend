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
- `POST /wallet/airtime`
- `POST /wallet/data`
- `POST /wallet/utilities`
- `POST /integrations/webhooks/flutterwave`
- `POST /integrations/webhooks/lead-bank`

### Card top-up

- `POST /wallet/top-up/card`
  - creates a provider-backed top-up intent
  - currently available for NG card funding through Flutterwave
  - returns a normalized provider response with `reference`, `status`, `checkoutUrl`, and `redirectUrl`

### NG / Flutterwave payload notes

- `POST /wallet/external-transfer`
  - `destinationRoutingNumber` should carry the destination bank code for NG transfers.
  - `metadata.bankCode` is also accepted as a fallback.
- `POST /wallet/airtime`
  - `metadata.billerCode` and `metadata.itemCode` should be supplied for Flutterwave bill purchase routing.
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
