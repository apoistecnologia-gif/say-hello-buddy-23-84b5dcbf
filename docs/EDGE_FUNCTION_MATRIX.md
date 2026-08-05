# Edge Function Database Dependency Matrix

Validated against source code in `supabase/functions/` on 2026-08-05.

| Function Slug | Table Name | Op | Exact Columns (R/W) | Status Values Expected |
| :--- | :--- | :--- | :--- | :--- |
| **request-ride** | `rides` | INSERT | passenger_id, category, origin_name, origin_lat, origin_lng, destination_name, destination_lat, destination_lng, estimated_price, distance_km, duration_min, payment_method, request_key, status, pickup_label, pickup_short_label, pickup_address, pickup_place_id, pickup_source, service_details, scheduled_for | `procurar_motorista` |
| | `rides` | UPDATE | candidate_driver_ids, offered_driver_ids, current_offer_driver_id, request_expires_at, dispatch_attempts, status, cancelled_at, cancelled_by, cancel_reason | `cancelada_passageiro` |
| | `drivers` | SELECT | user_id, category, is_online, approval_status, current_lat, current_lng, last_location_at | `aprovado` |
| | `subscriptions` | SELECT | driver_id, status, paid_at, period_start, period_end | `active` |
| | `driver_preferences` | SELECT | user_id, ride_alerts, accept_short, accept_long, accept_cash, accept_pix, accept_card, max_radius_km | |
| | `ride_categories` | SELECT | id, code, name | |
| | `tariff_rules` | SELECT | category_key, field_key, value | |
| **mercadopago-webhook** | `payment_webhook_receipts` | INSERT/UPDATE | provider, event_key, request_id, status, detail, processed_at | `processing`, `processed`, `rejected`, `ignored` |
| | `cancellation_fees` | SELECT/UPDATE | fee_amount, is_paid, mp_payment_id | |
| | `driver_payment_events` | INSERT | provider, event_type, mp_payment_id, status, value, paid_at, raw_payload | |
| | `subscriptions` | SELECT/UPDATE | amount, status, paid_at, provider_reference, provider_payment_id | `active`, `pending`, `overdue` |
| **send-ride-push** | `user_notification_tokens` | SELECT | user_id, token, platform | `android` |
| | `user_notification_preferences` | SELECT | user_id, ride_updates, ride_requests | |
| | `notification_logs` | INSERT | user_id, event, channel, title, body, data, status, error | `sent`, `partial` |
| **admin-actions** | `ride_categories` | CRUD | key, label, icon, color, enabled, sort_order | |
| | `tariff_rules` | UPSERT/DELETE | category_key, field_key, value | |
| | `coupons` | CRUD | code, type, value, description, max_discount, valid_from, valid_to, usage_limit, scope_category, enabled | |
| | `drivers` | UPDATE | approval_status, motivo_reprovacao, approved_at, blocked_at, documents_status, suspended_at, subscription_status, payment_status, subscription_expires_at, subscription_grace_days, subscription_admin_note | |
| | `admin_driver_notes` | INSERT/DELETE | driver_id, admin_id, note | |
| | `users` | UPDATE | suspended_at, block_reason, blocked_at | |
| | `admin_passenger_notes` | INSERT/DELETE | passenger_id, admin_id, note | |
| | `user_roles` | UPSERT/DELETE | user_id, role | |
| | `notification_inbox` | INSERT | user_id, title, body, category, data | |
| | `notifications_broadcast` | INSERT | title, body, audience_type, audience_filter, sent_by, delivery_count | |
| | `subscription_plans` | INSERT | name, price, promotional_price, billing_cycle_days, grace_period_days, enabled | |
| **request-driver-payout** | `app_settings` | SELECT | key, value | |
| | `driver_withdrawals` | INSERT (RPC) | driver_id, amount, status, pix_key, pix_key_type, pix_holder_name | `pending` |
| **delete-my-account** | `account_deletion_requests` | INSERT/UPDATE | user_id, role, status, completed_at | `requested`, `completed` |
| | `users` | UPDATE | name, email, phone, cpf, avatar_url, birth_date, gender, emergency_contact_name, emergency_contact_phone, preferences, blocked_at, block_reason, deleted_at | |
| | `drivers` | UPDATE | name, email, phone, cpf, birth_date, city, state, vehicle_model, vehicle_color, vehicle_plate, is_online, current_lat, current_lng, current_heading, current_speed, last_location_at, photo_url, selfie_url, cnh_url, cnh_back_url, vehicle_document_url, vehicle_photo_url, insurance_url, pix_key, pix_key_type, pix_holder_name, mercadopago_payer_id, mercadopago_preapproval_id, mercadopago_init_point, asaas_customer_id, asaas_subscription_id, last_invoice_url, blocked_at | |
| | Multiple | DELETE | [Cleanup of 12 peripheral tables] | |

## Verification Status
- **Schema Alignment**: 100% verified against source code.
- **Enums**: All values found in code are present in baseline.
- **RPCs**: Required RPCs for payouts and fees mapped.
- **Blocked Functions**: 0.

*Report generated automatically after line-by-line source audit.*
