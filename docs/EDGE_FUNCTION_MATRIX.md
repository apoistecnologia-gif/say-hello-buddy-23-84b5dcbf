# APOIS Edge Function Security Matrix

This document provides a comprehensive security and runtime audit for all 15 deployable Edge Functions in the APOIS ecosystem.

## Global CORS Policy
All functions (except webhooks) utilize the shared CORS helper in `supabase/functions/_shared/cors.ts`.
- **Allowed Origins:** Exact match for `https://say-hello-buddy-23.lovable.app`, `http://localhost:8080`, and any `*.lovable.app` subdomain (HTTPS only).
- **Environment Configuration:** Additional origins can be added via the `ALLOWED_ORIGINS` secret (comma-separated).
- **Unknown Origins:** Requests from unauthorized origins do not receive an `Access-Control-Allow-Origin` header, effectively blocking browser-based cross-origin requests.
- **Capacitor/Server-to-Server:** Requests without an `Origin` header are permitted to support native mobile apps and trusted backend calls.

---

## 1. admin-actions
- **Slug:** `admin-actions`
- **Path:** `supabase/functions/admin-actions/index.ts`
- **Entrypoint:** `Deno.serve`
- **Verify JWT:** Yes (`verify_jwt: true` in `config.toml`)
- **Caller Type:** Admin Web Dashboard
- **Identity Source:** Supabase Auth (JWT)
- **Role Check:** Requires `admin` or `super_admin` role in `public.user_roles`.
- **Ownership Check:** N/A (Admin level)
- **Tables Read:** `user_roles`, `app_settings`, `payment_webhook_receipts`, etc. (via `service_role`).
- **Tables Written:** `admin_audit_logs`, `app_settings`, etc.
- **RPCs:** N/A
- **Input Validation:** Strict JSON schema for `action` and `payload`.
- **CORS:** Uses shared helper; restricted to admin domains.
- **Safe Staging Test:** Call with `action: "health_check"`.
- **Production Classification:** Mission Critical (System Config).

---

## 2. approve-driver-and-create-mercadopago-subscription
- **Slug:** `approve-driver-and-create-mercadopago-subscription`
- **Path:** `supabase/functions/approve-driver-and-create-mercadopago-subscription/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Admin Web Dashboard
- **Identity Source:** Supabase Auth (JWT)
- **Role Check:** Requires `admin` or `super_admin`.
- **Tables Read:** `drivers`, `subscription_plans`.
- **Tables Written:** `drivers`, `subscriptions` (via shared MP helper).
- **External Provider:** Mercado Pago (Subscriptions API).
- **CORS:** Uses shared helper.
- **Safe Staging Test:** Approve a test driver with mock MP response.

---

## 3. create-cancellation-fee-charge
- **Slug:** `create-cancellation-fee-charge`
- **Path:** `supabase/functions/create-cancellation-fee-charge/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Driver/Passenger App
- **Identity Source:** Supabase Auth (JWT)
- **Ownership Check:** Validates that the ride belongs to the caller.
- **Tables Written:** `cancellation_fees`.
- **External Provider:** Mercado Pago (Payment Proccessing).

---

## 4. create-my-mercadopago-subscription
- **Slug:** `create-my-mercadopago-subscription`
- **Path:** `supabase/functions/create-my-mercadopago-subscription/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Driver App (Self-service)
- **Identity Source:** Supabase Auth (JWT)
- **Ownership Check:** Restricted to the authenticated driver's own account.
- **Tables Read:** `drivers`, `subscription_plans`.

---

## 5. delete-my-account
- **Slug:** `delete-my-account`
- **Path:** `supabase/functions/delete-my-account/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Mobile Apps (User Settings)
- **Identity Source:** Supabase Auth (JWT)
- **Ownership Check:** Deletes only the caller's data.
- **Tables Written:** `account_deletion_requests`, `users` (soft-delete/anonymize).
- **Side Effects:** Deletes files from Supabase Storage; calls Auth Admin API to delete user.

---

## 6. dispatch-broadcast-test
- **Slug:** `dispatch-broadcast-test`
- **Path:** `supabase/functions/dispatch-broadcast-test/index.ts`
- **Verify JWT:** N/A (Internal/Test)
- **Production Status:** Disabled/Placeholder (Only active in test environment).

---

## 7. mercadopago-health
- **Slug:** `mercadopago-health`
- **Path:** `supabase/functions/mercadopago-health/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Admin Web Dashboard
- **Role Check:** Requires `admin`, `super_admin`, or `financial`.
- **External Provider:** Mercado Pago (Credentials check).

---

## 8. mercadopago-webhook
- **Slug:** `mercadopago-webhook`
- **Path:** `supabase/functions/mercadopago-webhook/index.ts`
- **Verify JWT:** No (Public Endpoint for Webhook)
- **Security Boundary:** HMAC Signature Validation (`X-Signature` header).
- **Identity Source:** Signature derived from `MERCADOPAGO_WEBHOOK_SECRET`.
- **Tables Written:** `payment_webhook_receipts`, `subscriptions`, `drivers`, `driver_payment_events`.
- **Idempotency:** `event_key` (Unique constraint) prevents duplicate processing.
- **CORS:** Browser CORS not required (Server-to-server). Headers are omitted.

---

## 9. passenger-geocode-reverse
- **Slug:** `passenger-geocode-reverse`
- **Path:** `supabase/functions/passenger-geocode-reverse/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Passenger App
- **External Provider:** Google Maps Geocoding API.
- **CORS:** Uses shared helper.

---

## 10. passenger-pricing-estimate
- **Slug:** `passenger-pricing-estimate`
- **Path:** `supabase/functions/passenger-pricing-estimate/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Passenger App
- **Tables Read:** `ride_categories`, `tariff_rules`.
- **Logic:** Server-side fare calculation (Architecture A).

---

## 11. passenger-routes-compute
- **Slug:** `passenger-routes-compute`
- **Path:** `supabase/functions/passenger-routes-compute/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Passenger App
- **External Provider:** Google Routes API (v2).

---

## 12. regenerate-driver-mercadopago-charge
- **Slug:** `regenerate-driver-mercadopago-charge`
- **Path:** `supabase/functions/regenerate-driver-mercadopago-charge/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Admin Web Dashboard
- **Role Check:** Admin level.
- **Side Effects:** Creates in-app notification for the driver.

---

## 13. request-driver-payout
- **Slug:** `request-driver-payout`
- **Path:** `supabase/functions/request-driver-payout/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Driver App (Wallet)
- **Identity Source:** Supabase Auth (JWT)
- **RPCs:** `request_driver_withdrawal`, `mark_driver_withdrawal_paid`, `mark_driver_withdrawal_failed`.
- **Idempotency:** `X-Idempotency-Key` passed to Mercado Pago Money Out API.
- **External Provider:** Mercado Pago (Pix Transfers).

---

## 14. request-ride
- **Slug:** `request-ride`
- **Path:** `supabase/functions/request-ride/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Passenger App
- **Identity Source:** Supabase Auth (JWT)
- **Tables Written:** `rides`, `ride_events`.
- **Side Effects:** Triggers push notifications to available drivers via `send-ride-push`.

---

## 15. send-ride-push
- **Slug:** `send-ride-push`
- **Path:** `supabase/functions/send-ride-push/index.ts`
- **Verify JWT:** Yes
- **Caller Type:** Driver/Passenger Apps & Internal RPCs.
- **Role Check:** Non-admins are restricted to `ALLOWED_EVENTS` and must be participants in the `ride_id` provided.
- **External Provider:** Firebase Cloud Messaging (FCM).
- **Identity Source:** JWT (User) or Service Role Key (Server-to-server).
- **Tables Read:** `rides`, `user_notification_tokens`, `user_notification_preferences`.
