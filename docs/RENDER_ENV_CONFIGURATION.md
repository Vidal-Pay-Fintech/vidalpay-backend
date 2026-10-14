# Render environment configuration checklist

This file contains environment variable names and safe non-secret example values only. Do not paste real secrets into this file.

## Minimum Fincra sandbox wallet/KYC test mode

Set these in Render for the backend service:

```env
FINCRA_BASE_URL=https://sandboxapi.fincra.com
FINCRA_API_KEY=<fincra-test-secret-key>
FINCRA_BUSINESS_ID=<fincra-business-id>
FINCRA_KYC_ENABLED=true
FINCRA_WEBHOOK_SECRET=<fincra-webhook-or-encryption-key>
FINCRA_WALLET_TEST_MODE=true
```

`FINCRA_WALLET_TEST_MODE=true` enables the backend catalogue for NGN, USD, GBP, and CAD sandbox wallet activation requests without requiring the large `FINCRA_WALLET_PRODUCTS_JSON` variable. It does not fabricate account numbers, mark wallets active, or bypass Fincra. Provider requests can still fail if the Fincra sandbox account has not been approved for the requested product/currency.

If product-specific controls are preferred instead of the test-mode switch, set these per currency:

```env
FINCRA_NGN_CAN_PROVISION=true
FINCRA_NGN_REQUIREMENTS_CONFIGURED=true
FINCRA_USD_CAN_PROVISION=true
FINCRA_USD_REQUIREMENTS_CONFIGURED=true
FINCRA_GBP_CAN_PROVISION=true
FINCRA_GBP_REQUIREMENTS_CONFIGURED=true
FINCRA_CAD_CAN_PROVISION=true
FINCRA_CAD_REQUIREMENTS_CONFIGURED=true
```

`FINCRA_WALLET_PRODUCTS_JSON` remains supported for advanced product catalog configuration.

## Yellow Card crypto read-only/quote mode

```env
CRYPTO_PROVIDER_MODE=yellowcard
YELLOWCARD_BASE_URL=https://sandbox.api.yellowcard.io
YELLOWCARD_API_KEY=<yellowcard-api-key>
YELLOWCARD_SECRET_KEY=<yellowcard-secret-key>
YELLOWCARD_WEBHOOK_SECRET=<yellowcard-webhook-secret>
```

The current Yellow Card integration is read-only/quote-only. It does not debit wallets or execute buy/sell/send/receive.

## VTU.ng

```env
VTU_BASE_URL=https://vtu.ng/wp-json
VTU_USERNAME=<vtu-username-or-email>
VTU_PASSWORD=<vtu-password>
VTU_USER_PIN=<vtu-user-pin-or-webhook-signing-secret>
VTU_WEBHOOK_SECRET=<optional-vtu-webhook-secret>
```

## Sudo cards

```env
SUDO_BASE_URL=https://api.sandbox.sudo.africa
SUDO_API_KEY=<sudo-api-key>
SUDO_CARD_PROGRAM_ID=<sudo-card-program-id>
```

## Support providers

```env
ZENDESK_SUBDOMAIN=<zendesk-subdomain>
ZENDESK_OAUTH_TOKEN=<zendesk-oauth-token>
ZENDESK_WEBHOOK_SECRET=<zendesk-webhook-secret>

WHATSAPP_PHONE_NUMBER_ID=<whatsapp-phone-number-id>
WHATSAPP_ACCESS_TOKEN=<whatsapp-access-token>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<whatsapp-verify-token>
WHATSAPP_APP_SECRET=<whatsapp-app-secret>
```

## Validation order after Render deploy

1. Login as a real user.
2. Call `GET /providers/status` with the user token.
3. Confirm `wallet_activation` is not missing `FINCRA_API_KEY` or `FINCRA_BASE_URL`.
4. Call `GET /wallets/available`.
5. Call `GET /wallets/GBP/eligibility`.
6. Call `POST /wallets/GBP/activate` only when eligibility says requirements are complete.
7. Watch Render logs for sanitized provider errors. Do not paste secrets into logs or chat.
