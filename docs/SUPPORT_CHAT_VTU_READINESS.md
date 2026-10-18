# Zendesk, WhatsApp, and VTU integration readiness

This backend now exposes safe integration surfaces for customer support and bill/recharge providers without pretending the providers are production-ready.

## Safety status

- Zendesk and WhatsApp readiness checks do not change wallet balances.
- VTU purchases require a transaction PIN and idempotency key, create a ledger hold before provider submission, and await provider confirmation. Failed/refunded orders reverse that hold.
- No production migrations are run automatically.
- No provider secrets are returned to mobile.
- VTU.ng catalog, validation, purchase, and signed webhook paths are implemented. They are not considered live-ready until Render credentials and provider callback delivery are tested end to end.
- Zendesk ticket creation remains blocked until the Zendesk adapter is implemented and live-tested, but local support tickets are still saved.
- WhatsApp webhooks are accepted into provider-operation audit storage only; dedicated live-chat tables are still required before WhatsApp becomes the production chat source of truth.

## Provider status capabilities

The provider status response includes these additional capabilities:

| Capability | Provider | Status behavior |
|---|---|---|
| `zendesk_support` | Zendesk | Configured only when backend Zendesk credentials are present. |
| `whatsapp_support` | WhatsApp Cloud API | Configured only when backend WhatsApp credentials and verify token are present. |
| `vtu_catalog` | VTU.ng | Configured when provider, base URL, and login credentials are present; successful provider response still needs live verification. |
| `vtu_validate` | VTU.ng | Uses the provider verify-customer endpoint for utility customer checks. |
| `vtu_purchase` | VTU.ng | Requires provider credentials; purchases use a local ledger hold and await webhook settlement. |
| `vtu_requery` | VTU.ng | Webhook reconciliation is implemented; the adapter also has provider requery support, but no periodic reconciliation worker is currently configured. |

## Required environment variable names

### Zendesk

```text
ZENDESK_SUBDOMAIN
ZENDESK_OAUTH_TOKEN
ZENDESK_WEBHOOK_SECRET
ZENDESK_DEFAULT_GROUP_ID
ZENDESK_DEFAULT_BRAND_ID
```

### WhatsApp Cloud API

```text
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_WEBHOOK_VERIFY_TOKEN
WHATSAPP_WEBHOOK_SECRET
```

### VTU.ng

```text
VTU_PROVIDER
VTU_BASE_URL
VTU_USERNAME (or VTU_EMAIL)
VTU_PASSWORD
VTU_USER_PIN (or VTU_WEBHOOK_SECRET for callback verification)
```

## Webhook URLs to configure later

Assuming the deployed API base is `https://vidalpay-backend-1.onrender.com/api/v1`:

| Provider | URL | Purpose |
|---|---|---|
| MetaMap | `/webhooks/kyc/metamap` | Existing KYC callback. |
| WhatsApp | `/webhooks/whatsapp` | GET verification and POST inbound/status callback. |
| Zendesk | `/webhooks/zendesk` | Ticket status/event callback. |
| VTU | `/webhooks/vtu` | VTU payment/status callback if the provider supports webhooks. |

## Current endpoint behavior

### Support tickets

`POST /support/tickets` still saves a local `support_ticket` row. If Zendesk is not configured, the response includes `providerSync.status = NOT_CONFIGURED`. If Zendesk credentials are present, the response still stays blocked until the adapter is implemented and live-tested.

### WhatsApp live support

`GET /webhooks/whatsapp` verifies Meta's webhook challenge using only `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

`POST /webhooks/whatsapp` records an idempotent provider operation for audit/deduplication. It does not claim full live-chat persistence because `support_conversation` and `support_message` tables are still not present.

### VTU bills and recharge

The mobile app consumes these authenticated routes:

- `GET /wallet/catalogs/airtime`
- `GET /wallet/catalogs/data`
- `GET /wallet/catalogs/utilities`
- `POST /wallet/utilities/validate`
- `POST /wallet/airtime`
- `POST /wallet/data`
- `POST /wallet/utilities`

Purchase requests require a transaction PIN and idempotency key. The backend holds NGN before submitting to VTU.ng, leaves accepted requests pending provider confirmation, and reverses the hold on provider failure/refund. The `/webhooks/vtu` callback must be configured and verified in the deployed environment before describing the flow as live-tested.

## Remaining production blockers

1. Run the read-only production inventory and review legacy tables.
2. Add safe non-destructive migrations for ledger/provider/chat tables after schema review.
3. Implement Zendesk ticket creation/update adapter.
4. Implement WhatsApp conversation/message persistence.
5. Confirm the deployed VTU.ng sandbox account, environment variables, product access, and callback signing method.
6. Run sandbox tests for airtime, data, utility validation/payment, pending, failed and refunded outcomes.
7. Add a scheduled reconciliation job for pending VTU and financial provider operations.
8. Complete admin dashboard views for support tickets, WhatsApp conversations, VTU operations, reconciliation runs, and ledger entries.
