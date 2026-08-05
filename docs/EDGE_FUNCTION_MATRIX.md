# APOIS EDGE FUNCTION SECURITY & DEPLOYMENT MATRIX

## Deployable Edge Functions

| Function Slug | verify_jwt | Authentication | Purpose | Required Secrets | Tables Used | External APIs | Staging Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **admin-actions** | true | Admin Role | Admin operations (coupons, categories, push) | `SUPABASE_SERVICE_ROLE_KEY` | `drivers`, `users`, `ride_categories`, `tariff_rules`, `coupons`, `notifications_broadcast`, `notification_logs` | None | Safe |
| **approve-driver-and-create-mercadopago-subscription** | true | Admin Role | Approves driver & sets up MP subscription | `MERCADOPAGO_ACCESS_TOKEN` | `drivers`, `subscriptions`, `subscription_plans`, `driver_payment_events` | Mercado Pago | Safe |
| **create-cancellation-fee-charge** | true | JWT (Internal) | Charges MP for cancellation fees | `MERCADOPAGO_ACCESS_TOKEN` | `cancellation_fees`, `rides`, `payment_methods` | Mercado Pago | Safe |
| **create-my-mercadopago-subscription** | true | User | Creates personal MP subscription | `MERCADOPAGO_ACCESS_TOKEN` | `drivers`, `subscription_plans`, `subscriptions` | Mercado Pago | Safe |
| **delete-my-account** | true | User | GDPR deletion request | None | `account_deletion_requests`, `users`, `drivers`, `passenger_wallets` | None | Safe |
| **dispatch-broadcast-test** | true | Admin Role | Tests Realtime notification delivery | None | `drivers` | None | Safe (Dev only) |
| **mercadopago-health** | false | Public | MP Webhook connectivity check | None | None | None | Safe |
| **mercadopago-webhook** | **false** | **HMAC Sig** | Processes MP payment notifications | `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` | `payment_webhook_receipts`, `cancellation_fees`, `drivers`, `subscriptions`, `driver_payment_events` | Mercado Pago | Safe (w/ Mock) |
| **passenger-geocode-reverse** | true | User | Converts Lat/Lng to address | `GOOGLE_MAPS_PLATFORM_API_KEY` | None | Google Maps | Safe |
| **passenger-pricing-estimate** | true | User | Calculates estimated ride price | None | `tariff_rules`, `ride_categories` | None | Safe |
| **passenger-routes-compute** | true | User | Computes path and distance | `GOOGLE_MAPS_PLATFORM_API_KEY` | None | Google Maps | Safe |
| **regenerate-driver-...** | true | Admin/User | Re-triggers failed MP charges | `MERCADOPAGO_ACCESS_TOKEN` | `subscriptions`, `driver_payment_events` | Mercado Pago | Safe |
| **request-driver-payout** | true | User | Requests wallet withdrawal | None | `driver_withdrawals`, `passenger_wallets`, `drivers` | None | Safe |
| **request-ride** | true | User | Creates ride and dispatches drivers | `GOOGLE_MAPS_PLATFORM_API_KEY` | `rides`, `drivers`, `tariff_rules`, `subscriptions`, `driver_preferences` | Google Maps | **Risk** (Creates Ride) |
| **send-ride-push** | true | JWT (Internal) | Sends FCM notifications | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | `user_notification_tokens`, `notification_logs` | Firebase | Safe |

## Shared Modules (Non-Deployable)
- `_shared/pricing.ts`
- `_shared/mercadopago.ts`
- `_shared/supabaseAdmin.ts`

## Production Configuration (config.toml)
```toml
project_id = "vqtucstyduxrqjgyigfk"

[functions.mercadopago-webhook]
verify_jwt = false

[functions.mercadopago-health]
verify_jwt = false

[functions.request-ride]
verify_jwt = true

[functions.admin-actions]
verify_jwt = true
```

## Dependency Validation
- **`request-driver-payout`**: Requires `driver_withdrawals` table. Included in Clean Baseline.
- **`subscriptions`**: Requires `subscriptions` and `subscription_plans` tables. Included in Clean Baseline.
- **`send-ride-push`**: Requires `user_notification_tokens` and `notification_logs`. Included in Clean Baseline.
- **`delete-my-account`**: Requires `account_deletion_requests`. Included in Clean Baseline.
- **`mercadopago-webhook`**: Requires `payment_webhook_receipts` for idempotency. Included in Clean Baseline.
- **`admin-actions`**: Requires `admin_audit_logs`, `admin_driver_notes`, etc. Included in Clean Baseline.
