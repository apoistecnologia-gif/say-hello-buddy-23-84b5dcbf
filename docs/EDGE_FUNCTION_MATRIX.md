# Edge Function Security & Authorization Matrix

Validated against source code on 2026-08-05.

| Slug | verify_jwt | Caller Type | Identity Source | Role Check | Idempotency | Signature | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **admin-actions** | true | Admin | JWT (sub) | `admin`, `super_admin` | Audit Log | - | READY |
| **approve-driver-...** | true | Admin | JWT (sub) | `admin`, `super_admin` | MP Pref ID | - | READY |
| **create-cancellation...** | true | Passenger | JWT (sub) | Ownership Check | MP Idempotency | - | READY |
| **create-my-mp-sub** | true | Driver | JWT (sub) | `aprovado` status | MP Pref ID | - | READY |
| **delete-my-account** | true | User | JWT (sub) | Self-only | Request Record | - | READY |
| **dispatch-broadcast...** | true | Internal | JWT (sub) | `admin` | Test Isolation | - | STAGING_ONLY |
| **mercadopago-health** | true | Admin | JWT (sub) | `financial`+ | - | - | READY |
| **mercadopago-webhook** | **false** | Webhook | Provider ID | - | `event_key` (Unique) | **HMAC-SHA256** | READY |
| **passenger-geocode** | true | Passenger | JWT (sub) | - | - | - | READY |
| **passenger-pricing** | true | Passenger | JWT (sub) | - | - | - | READY |
| **passenger-routes** | true | Passenger | JWT (sub) | - | - | - | READY |
| **regenerate-driver...** | true | Admin | JWT (sub) | `admin`, `super_admin` | MP Pref ID | - | READY |
| **request-driver-payout** | true | Driver | JWT (sub) | Balance Check | `payout-{id}` | - | READY |
| **request-ride** | true | Passenger | JWT (sub) | - | `request_key` | - | READY |
| **send-ride-push** | true | Mixed | JWT (sub) / Service | Ride Participation | - | - | READY |

## Summary
- **READY**: 14
- **BLOCKED**: 0
- **STAGING_ONLY**: 1 (dispatch-broadcast-test)
- **PUBLIC/WEBHOOK**: 1 (mercadopago-webhook)

*Report generated after line-by-line security audit and hardening.*
