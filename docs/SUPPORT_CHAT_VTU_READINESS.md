# Zendesk, WhatsApp, and VTU production-readiness foundation

This backend now exposes safe integration surfaces for customer support and bill/recharge providers without pretending the providers are production-ready.

## Safety status

- No wallet balances are changed by Zendesk, WhatsApp, or VTU readiness code.
- No production migrations are run automatically.
- No provider secrets are returned to mobile.
- VTU bill/recharge purchase remains blocked until the exact provider contract, requery flow, ledger hold/finalization, and reversal behavior are implemented and live-tested.
- Zendesk ticket creation remains blocked until the Zendesk adapter is implemented and live-tested, but local support tickets are still saved.
- WhatsApp webhooks are accepted into provider-operation audit storage only; dedicated live-chat tables are still required before WhatsApp becomes the production chat source of truth.

## Provider status capabilities

The provider status response includes these additional capabilities:

| Capability | Provider | Status behavior |
|---|---|---|
| `zendesk_support` | Zendesk | Configured only when backend Zendesk credentials are present. |
| `whatsapp_support` | WhatsApp Cloud API | Configured only when backend WhatsApp credentials and verify token are present. |
| `vtu_catalog` | VTU provider | Configured only when VTU provider/base URL/API key are present, but catalog remains not live-tested. |
| `vtu_validate` | VTU provider | Blocked until exact provider validation contract is implemented. |
| `vtu_purchase` | VTU provider | Blocked until exact provider purchase, requery, ledger, and reversal flow is implemented. |
| `vtu_requery` | VTU provider | Placeholder for status requery/webhook reconciliation. |

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

### VTU provider

```text
VTU_PROVIDER
VTU_BASE_URL
VTU_API_KEY
VTU_API_SECRET
VTU_WEBHOOK_SECRET
VTU_REQUERY_ENABLED
VTU_ENVIRONMENT
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

When VTU credentials are detected, catalog endpoints return an honest `PROVIDER_CONFIGURED_NOT_LIVE_TESTED` empty catalog until the exact VTU catalog API is implemented.

Purchase endpoints continue to require transaction PIN and idempotency key. If VTU is configured, purchases are persisted as blocked provider operations and return unavailable instead of debiting wallets or faking success.

## Remaining production blockers

1. Run the read-only production inventory and review legacy tables.
2. Add safe non-destructive migrations for ledger/provider/chat tables after schema review.
3. Implement Zendesk ticket creation/update adapter.
4. Implement WhatsApp conversation/message persistence.
5. Select the exact VTU provider and implement its catalog, validation, purchase, requery, and webhook contracts.
6. Add ledger hold/finalization/reversal before enabling VTU money movement.
7. Add reconciliation jobs for pending VTU and financial provider operations.
8. Complete admin dashboard views for support tickets, WhatsApp conversations, VTU operations, reconciliation runs, and ledger entries.
