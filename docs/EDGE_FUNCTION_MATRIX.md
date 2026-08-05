# Edge Function Deployment Matrix - APOIS

| Slug | verify_jwt | Authentication | Purpose | External APIs | Tables | Secrets Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **admin-actions** | true | Admin Role Check | Protected Admin OPS | - | * | - |
| **request-ride** | true | JWT (Passenger) | Create/Dispatch ride | Google Routes | rides, drivers, users | GOOGLE_MAPS_API_KEY |
| **passenger-pricing-estimate** | true | JWT (Passenger) | Real-time pricing | - | tariff_rules, ride_categories | - |
| **passenger-geocode-reverse** | true | JWT (Passenger) | Lat/Lng to Address | Google Geocoding | - | GOOGLE_MAPS_API_KEY |
| **passenger-routes-compute** | true | JWT (Passenger) | Calculate route path | Google Routes | - | GOOGLE_MAPS_API_KEY |
| **mercadopago-webhook** | false | Signature Valid. | MP Payment Update | Mercado Pago | cancellation_fees, subscriptions | MERCADOPAGO_WEBHOOK_SECRET |
| **mercadopago-health** | true | Admin Role Check | MP Connectivity Test | Mercado Pago | - | MERCADOPAGO_ACCESS_TOKEN |
| **request-driver-payout** | true | JWT (Driver) | Payout via Pix | Mercado Pago | driver_withdrawals | MERCADOPAGO_ACCESS_TOKEN |
| **send-ride-push** | true | JWT/Service Role | Send FCM Notif | Firebase FCM | notification_tokens | FIREBASE_SERVICE_ACCOUNT_B64 |
| **create-cancellation-fee-charge** | true | JWT (Passenger) | Generate Pix for Fee | Mercado Pago | cancellation_fees | MERCADOPAGO_ACCESS_TOKEN |
| **create-my-mercadopago-subscription** | true | JWT (Driver) | Pay Monthly Fee | Mercado Pago | subscriptions | MERCADOPAGO_ACCESS_TOKEN |
| **approve-driver-and-create-...** | true | Admin Role Check | Driver Approval | Mercado Pago | drivers | MERCADOPAGO_ACCESS_TOKEN |
| **delete-my-account** | true | JWT | User data deletion | - | users | - |
| **regenerate-driver-mercadopago-...** | true | Admin/Driver | Retry Payment | Mercado Pago | subscriptions | MERCADOPAGO_ACCESS_TOKEN |

## Implementation Details

- **_shared**: Contains shared logic for CORS, Google Maps, and Mercado Pago. Not deployable.
- **Idempotency**: `request-ride` uses `request_key`; `mercadopago-webhook` uses `event_key`.
- **Security**: Webhooks use HMAC signature verification (`X-Signature`).
