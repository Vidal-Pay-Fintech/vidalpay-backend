# Fincra KYC, FX, wallet, card, and VTU readiness

## Fincra KYC

Fincra is now preferred for Nigeria KYC only when these backend variables are configured:

- `FINCRA_KYC_ENABLED=true`
- `FINCRA_API_KEY`
- `FINCRA_BUSINESS_ID`

When enabled, `POST /kyc/start` returns a backend-verification contract for Fincra and keeps MetaMap as fallback if MetaMap credentials are present. The implemented Fincra identity check is BVN verification through the backend. Raw BVN values are not stored in provider operations; only a fingerprint and sanitized provider response are kept.

MetaMap remains the fallback hosted verification provider.

## FX rates and quotes

Implemented endpoints:

- `GET /fx/rates`
- `GET /fx/quotes?fromCurrency=NGN&toCurrency=USD&amount=1000`
- `GET /user/home` now includes `exchangeRates`

Supported display currencies are:

- NGN
- USD
- GBP
- CAD

Rates are read-only through Fincra treasury rates when `FINCRA_API_KEY` is configured. Quotes are `QUOTE_ONLY` and `executable=false`.

`POST /fx/convert` remains blocked until ledger holds, settlement, reconciliation, and reversal behavior are implemented.

## Wallet activation

Fincra wallet activation continues to be idempotent and provider-backed. It does not create fake account numbers or alter balances. Wallets become active only when a verified provider webhook returns real account details that can be safely persisted.

## Cards

Current provider decision:

- NGN virtual/physical cards: Sudo sandbox adapter remains the implemented card issuer.
- Fincra cards: blocked until Fincra card issuing API access is proven.
- USD/foreign cards: blocked until provider customer/account/card mappings are implemented and tested.

## VTU.ng

VTU.ng v2 adapter support is now prepared for:

- JWT authentication
- catalog reads
- utility customer validation
- airtime/data/electricity purchase submission
- requery support
- webhook receipt

Purchases write idempotent provider operations and do not debit/finalize wallet balances until requery/webhook settlement and ledger finalization are implemented.

## Crypto and stablecoins

USDT, USDC, and CNGN remain excluded from ordinary user wallet products. Crypto remains blocked until provider access, signing, compliance, custody, and ledger flows are complete.
