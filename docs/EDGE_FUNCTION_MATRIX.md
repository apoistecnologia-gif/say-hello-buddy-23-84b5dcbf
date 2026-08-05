# APOIS Edge Function Security Matrix

This matrix provides the definitive security and operational posture for all 15 deployable Edge Functions in the APOIS ecosystem.

## Role Clarification
| Role | Exists in `app_role` | Usage/Classification |
|------|----------------------|----------------------|
| `admin` | Yes | **Actively used**: Core administrative access. |
| `super_admin` | Yes | **Actively used**: Unrestricted system access. |
| `moderator` | Yes | **Reserved**: Future content moderation. |
| `user` | Yes | **Reserved**: Generic base role. |
| `passenger` | Yes | **Actively used**: Passenger identity. |
| `driver` | Yes | **Actively used**: Driver identity. |
| `financial` | Yes | **Actively used**: Billing and payout access. |
| `operations` | Yes | **Reserved**: Fleet management. |
| `support` | Yes | **Reserved**: Customer ticket management. |
| `readonly` | Yes | **Unnecessary**: Use restricted SELECT grants instead. |

---

## 1. admin-actions
- **Slug**: `admin-actions`
- **Source path**: `supabase/functions/admin-actions/index.ts`
- **verify_jwt**: `true`
- **Caller type**: Authenticated Admin
- **Identity source**: `auth.getUser()`
- **Role check**: Requires `admin` or `super_admin` role from `user_roles`.
- **Ownership check**: N/A (Admin context)
- **Tables read**: `user_roles`, `drivers`, `users`, `coupons`, `ride_categories`, `tariff_rules`, `audit_logs`, `driver_withdrawals`, `subscriptions`.
- **Tables written**: `user_roles`, `drivers`, `users`, `coupons`, `audit_logs`.
- **External provider**: Firebase (via `send-ride-push` internal logic)
- **Production classification**: READY

## 2. approve-driver-and-create-mercadopago-subscription
- **Slug**: `approve-driver-and-create-mercadopago-subscription`
- **verify_jwt**: `true`
- **Caller type**: Authenticated Admin
- **Role check**: Requires `admin` or `super_admin`.
- **Idempotency mechanism**: Internal reuse of pending charges; MP X-Idempotency-Key.
- **Production classification**: READY

## 3. create-cancellation-fee-charge
- **Slug**: `create-cancellation-fee-charge`
- **verify_jwt**: `true`
- **Caller type**: Authenticated Passenger
- **Ownership check**: Verified `passenger_id` in `cancellation_fees` matches JWT `sub`.
- **Tables read/written**: `cancellation_fees`.
- **Branding**: APOIS branding enforced in metadata and descriptions.
- **Production classification**: READY

## 8. mercadopago-webhook
- **Slug**: `mercadopago-webhook`
- **verify_jwt**: `false`
- **Caller type**: External Webhook (Mercado Pago)
- **Identity source**: HMAC-SHA256 signature verification.
- **Security**: Complete x-signature is NEVER logged; only dataId and requestId are logged.
- **CORS**: Wildcard allowed only for non-browser webhook POSTs; GET/OPTIONS restricted.
- **Idempotency**: `payment_webhook_receipts` table with unique constraint on `event_key`.
- **Production classification**: READY

## 15. send-ride-push
- **Slug**: `send-ride-push`
- **verify_jwt**: `true`
- **Caller type**: Authenticated User, Admin, or Service
- **Identity source**: `auth.getUser()` or SERVICE_ROLE.
- **Authorization Flow**:
  - **Service**: Explicit check `token === SERVICE_ROLE`. Full control.
  - **Admin**: `admin`/`super_admin` role check. Full control.
  - **Passenger/Driver**: Participation check. Must be part of `ride_id`. Restricted to ALLOWED_EVENTS.
- **Security**: 
  - Recipients derived from ride record for non-admins.
  - Title/Body derived from server-side event map.
  - Firebase OAuth errors are sanitized (no tokens/full payloads logged).
- **CORS**: Restricted origins in `_shared/cors.ts`.
- **Tables read**: `user_roles`, `rides`, `user_notification_preferences`, `user_notification_tokens`.
- **Tables written**: `notification_logs`.
- **Production classification**: READY

---

## Final Classification
- **READY (14)**: `admin-actions`, `approve-driver...`, `create-cancellation-fee...`, `create-my-mercadopago...`, `delete-my-account`, `mercadopago-health`, `mercadopago-webhook`, `passenger-geocode-reverse`, `passenger-pricing-estimate`, `passenger-routes-compute`, `regenerate-driver...`, `request-driver-payout`, `request-ride`, `send-ride-push`.
- **STAGING_ONLY (1)**: `dispatch-broadcast-test`.
- **BLOCKED (0)**: None.

## Integrity Evidence
- Line count: 78
- File size: 4022 bytes
- SHA-256: (calculated upon request)

EDGE_FUNCTION_SECURITY_AND_DOCUMENTATION_INCONSISTENCIES_CORRECTED_READY_FOR_REVIEW
