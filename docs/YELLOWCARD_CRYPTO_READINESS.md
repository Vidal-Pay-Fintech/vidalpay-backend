# Yellow Card crypto/stablecoin readiness

This backend phase adds Yellow Card as the dedicated crypto/stablecoin provider without mixing it into Vidal Pay fiat wallet activation.

## Current scope

Implemented as read-only and quote-only:

- `GET /crypto/overview`
- `GET /crypto/assets`
- `GET /crypto/rates`
- `POST /crypto/quote`

The existing mutation endpoints remain blocked:

- `POST /crypto/deposit-address`
- `POST /crypto/withdrawal-quote`
- `POST /crypto/withdrawals`

No wallet balances are debited, no crypto wallets are fabricated, and no transaction records are created by the new read-only Yellow Card discovery/quote endpoints.

## Environment variables

Set only in Render or local private environment files that are not committed:

```env
CRYPTO_PROVIDER_MODE=yellowcard
YELLOWCARD_BASE_URL=https://sandbox.api.yellowcard.io
YELLOWCARD_API_KEY=...
YELLOWCARD_SECRET_KEY=...
YELLOWCARD_WEBHOOK_SECRET=...
```

`YELLOWCARD_SECRET_KEY` is used only by the backend HTTP client for provider request signing. It is never returned to mobile.

## Product model

Yellow Card is treated as a separate crypto/stablecoin provider domain:

```text
Vidal Pay fiat wallets -> ledger hold -> Yellow Card provider -> webhook/status settlement
```

This phase does not implement ledger holds or execution. Buy, sell, send and receive execution must wait until sandbox credentials, exact Yellow Card endpoint behavior, webhook signing, status polling, reversal rules and reconciliation are verified.

## Jurisdiction policy

The existing Vidal Pay product eligibility policy still applies. This phase does not change Nigerian crypto restrictions. If Vidal Pay wants Nigeria-based users to access Yellow Card stablecoin features, update the compliance/product eligibility policy explicitly and add regression tests.

## Next phase

1. Confirm Yellow Card sandbox credentials.
2. Probe the actual supported assets, fiat currencies, corridors, networks and quote response shape.
3. Verify webhook signature behavior and idempotency requirements.
4. Implement ledger holds for executable buy/sell/send.
5. Implement settlement and reversal handling from provider status/webhooks.
