# APOIS EDGE FUNCTION SECURITY & DEPLOYMENT MATRIX

## Deployable Edge Functions

| Function Slug | verify_jwt | Authentication | Purpose | Required Secrets | Tables Used | External APIs | Staging Test | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **admin-actions** | true | Admin Role | Admin operations (coupons, categories, push) | `SUPABASE_SERVICE_ROLE_KEY` | `drivers`, `users`, `ride_categories`, `tariff_rules`, `coupons`, `notifications_broadcast`, `notification_logs`, `subscription_plans`, `admin_audit_logs`, `admin_driver_notes`, `admin_passenger_notes`, `admin_subscription_notes`, `support_tickets`, `support_ticket_replies` | None | Safe | **READY** |
| **approve-driver-and-create-mercadopago-subscription** | true | Admin Role | Approves driver & sets up MP subscription | `MERCADOPAGO_ACCESS_TOKEN` | `drivers`, `subscriptions`, `subscription_plans`, `driver_payment_events` | Mercado Pago | Safe | **READY** |
| **create-cancellation-fee-charge** | true | JWT (Internal) | Charges MP for cancellation fees | `MERCADOPAGO_ACCESS_TOKEN` | `cancellation_fees`, `rides`, `payment_methods` | Mercado Pago | Safe | **READY** |
| **create-my-mercadopago-subscription** | true | User | Creates personal MP subscription | `MERCADOPAGO_ACCESS_TOKEN` | `drivers`, `subscription_plans`, `subscriptions` | Mercado Pago | Safe | **READY** |
| **delete-my-account** | true | User | GDPR deletion request | None | `account_deletion_requests`, `users`, `drivers`, `passenger_wallets` | None | Safe | **READY** |
| **dispatch-broadcast-test** | true | Admin Role | Tests Realtime notification delivery | None | `drivers` | None | Safe (Dev only) | **READY** |
| **mercadopago-health** | false | Public | MP Webhook connectivity check | None | None | None | Safe | **READY** |
| **mercadopago-webhook** | false | HMAC Sig | Processes MP payment notifications | `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` | `payment_webhook_receipts`, `cancellation_fees`, `drivers`, `subscriptions`, `driver_payment_events` | Mercado Pago | Safe (w/ Mock) | **READY** |
| **passenger-geocode-reverse** | true | User | Converts Lat/Lng to address | `GOOGLE_MAPS_PLATFORM_API_KEY` | None | Google Maps | Safe | **READY** |
| **passenger-pricing-estimate** | true | User | Calculates estimated ride price | None | `tariff_rules`, `ride_categories` | None | Safe | **READY** |
| **passenger-routes-compute** | true | User | Computes path and distance | `GOOGLE_MAPS_PLATFORM_API_KEY` | None | Google Maps | Safe | **READY** |
| **regenerate-driver-mercadopago-charge** | true | Admin/User | Re-triggers failed MP charges | `MERCADOPAGO_ACCESS_TOKEN` | `subscriptions`, `driver_payment_events` | Mercado Pago | Safe | **READY** |
| **request-driver-payout** | true | User | Requests wallet withdrawal | `MERCADOPAGO_ACCESS_TOKEN` | `driver_withdrawals`, `passenger_wallets`, `drivers`, `app_settings` | Mercado Pago | Safe | **READY** |
| **request-ride** | true | User | Creates ride and dispatches drivers | `GOOGLE_MAPS_PLATFORM_API_KEY` | `rides`, `drivers`, `tariff_rules`, `subscriptions`, `driver_preferences`, `app_settings` | Google Maps | **Risk** | **READY** |
| **send-ride-push** | true | JWT (Internal) | Sends FCM notifications | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | `user_notification_tokens`, `notification_logs`, `user_notification_preferences`, `rides` | Firebase | Safe | **READY** |

## Shared Modules (Non-Deployable)
- `_shared/pricing.ts`
- `_shared/mercadopago.ts`
- `_shared/supabaseAdmin.ts`
- `_shared/google-maps.ts`
- `_shared/cors.ts`

## Production Configuration (config.toml)
```toml
project_id = "vqtucstyduxrqjgyigfk"

[functions.mercadopago-webhook]
verify_jwt = false

[functions.mercadopago-health]
verify_jwt = false
```

## Dependency Validation
- **`request-driver-payout`**: Uses `driver_withdrawals` and `app_settings`.
- **`request-ride`**: Uses `rides`, `drivers`, `tariff_rules`, `subscriptions`, `driver_preferences`, `app_settings`.
- **`mercadopago-webhook`**: Processes `payment_webhook_receipts`, `cancellation_fees`, `driver_payment_events`.
- **`admin-actions`**: Comprehensive admin interface across `ride_categories`, `tariff_rules`, `coupons`, `subscriptions`, `audit_logs`, etc.
