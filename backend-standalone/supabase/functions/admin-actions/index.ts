import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "https://admin.movvidriver.com.br",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const ADMIN_ROLES = ["admin", "super_admin"];
const ASSIGNABLE_ROLES = new Set([
  "super_admin",
  "admin",
  "financial",
  "operations",
  "support",
  "readonly",
]);
const APPROVAL_STATUSES = new Set(["aprovado", "reprovado", "bloqueado", "em_analise"]);
const SUBSCRIPTION_STATUSES = new Set([
  "active",
  "inactive",
  "pending",
  "overdue",
  "suspended",
  "expired",
  "blocked",
  "cancelled",
]);
const PAYMENT_STATUSES = new Set(["paid", "unpaid", "pending", "refunded"]);
const COUPON_TYPES = new Set(["percent", "fixed", "first_ride", "free_delivery"]);
const AUDIENCES = new Set([
  "all",
  "drivers",
  "passengers",
  "city",
  "category",
  "driver",
  "passenger",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9_]+$/;
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const MAX_RECIPIENTS = 50_000;
const INSERT_BATCH = 500;

type JsonMap = Record<string, unknown>;
type AdminClient = ReturnType<typeof createClient>;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://admin.movvidriver.com.br";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json" },
  });
}

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function object(value: unknown): JsonMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_payload");
  return value as JsonMap;
}

function text(value: unknown, name: string, max = 500, min = 1): string {
  if (typeof value !== "string") fail(`invalid_${name}`);
  const out = value.trim();
  if (out.length < min || out.length > max) fail(`invalid_${name}`);
  return out;
}

function optionalText(value: unknown, name: string, max = 500): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, name, max, 0);
}

function uuid(value: unknown, name = "id"): string {
  const out = text(value, name, 36);
  if (!UUID_RE.test(out)) fail(`invalid_${name}`);
  return out;
}

function numberValue(value: unknown, name: string, min = 0, max = 1_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`invalid_${name}`);
  }
  return value;
}

function integer(value: unknown, name: string, min = 0, max = 10_000_000): number {
  const out = numberValue(value, name, min, max);
  if (!Number.isInteger(out)) fail(`invalid_${name}`);
  return out;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`invalid_${name}`);
  return value;
}

function enumValue(value: unknown, name: string, values: Set<string>): string {
  const out = text(value, name, 80);
  if (!values.has(out)) fail(`invalid_${name}`);
  return out;
}

function isoOrNull(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const out = text(value, name, 80);
  if (!Number.isFinite(Date.parse(out))) fail(`invalid_${name}`);
  return out;
}

async function ensureOk(result: { error: { message: string } | null }): Promise<void> {
  if (result.error) fail(result.error.message, 422);
}

async function resolveRecipients(
  admin: AdminClient,
  audience: string,
  filter: string | null,
): Promise<string[]> {
  const needsFilter = ["city", "category", "driver", "passenger"].includes(audience);
  if (needsFilter && !filter) fail("missing_filter");
  if (audience === "driver" || audience === "passenger") return [uuid(filter, "filter")];

  if (audience === "drivers") {
    const { data, error } = await admin
      .from("drivers")
      .select("user_id")
      .limit(MAX_RECIPIENTS + 1);
    if (error) fail(error.message, 422);
    return (data ?? []).map((r) => r.user_id as string).filter(Boolean);
  }
  if (audience === "passengers") {
    const { data, error } = await admin
      .from("users")
      .select("auth_user_id")
      .limit(MAX_RECIPIENTS + 1);
    if (error) fail(error.message, 422);
    return (data ?? []).map((r) => r.auth_user_id as string).filter(Boolean);
  }
  if (audience === "city") {
    const [drivers, passengers] = await Promise.all([
      admin
        .from("drivers")
        .select("user_id")
        .ilike("city", filter!)
        .limit(MAX_RECIPIENTS + 1),
      admin
        .from("users")
        .select("auth_user_id")
        .ilike("city", filter!)
        .limit(MAX_RECIPIENTS + 1),
    ]);
    if (drivers.error) fail(drivers.error.message, 422);
    if (passengers.error) fail(passengers.error.message, 422);
    return [
      ...(drivers.data ?? []).map((r) => r.user_id as string),
      ...(passengers.data ?? []).map((r) => r.auth_user_id as string),
    ].filter(Boolean);
  }
  if (audience === "category") {
    const { data, error } = await admin
      .from("drivers")
      .select("user_id")
      .eq("category", filter!)
      .limit(MAX_RECIPIENTS + 1);
    if (error) fail(error.message, 422);
    return (data ?? []).map((r) => r.user_id as string).filter(Boolean);
  }

  const [drivers, passengers] = await Promise.all([
    admin
      .from("drivers")
      .select("user_id")
      .limit(MAX_RECIPIENTS + 1),
    admin
      .from("users")
      .select("auth_user_id")
      .limit(MAX_RECIPIENTS + 1),
  ]);
  if (drivers.error) fail(drivers.error.message, 422);
  if (passengers.error) fail(passengers.error.message, 422);
  return [
    ...(drivers.data ?? []).map((r) => r.user_id as string),
    ...(passengers.data ?? []).map((r) => r.auth_user_id as string),
  ].filter(Boolean);
}

async function runAction(
  admin: AdminClient,
  actorId: string,
  action: string,
  rawPayload: unknown,
): Promise<unknown> {
  const p = object(rawPayload ?? {});

  switch (action) {
    case "category.create": {
      const key = text(p.key, "key", 32);
      if (!KEY_RE.test(key)) fail("invalid_key");
      const row = {
        key,
        label: text(p.label, "label", 64),
        icon: "Car",
        color: "#8DD92B",
        enabled: true,
        sort_order: integer(p.sort_order, "sort_order", 0, 9999),
      };
      await ensureOk(await admin.from("ride_categories").insert(row));
      return { ok: true };
    }
    case "category.update": {
      const id = uuid(p.id);
      const icon = text(p.icon, "icon", 64);
      const color = text(p.color, "color", 9);
      if (!COLOR_RE.test(color)) fail("invalid_color");
      await ensureOk(
        await admin
          .from("ride_categories")
          .update({
            label: text(p.label, "label", 64),
            icon,
            color,
            enabled: booleanValue(p.enabled, "enabled"),
            sort_order: integer(p.sort_order, "sort_order", 0, 9999),
          })
          .eq("id", id),
      );
      return { ok: true };
    }
    case "category.set_enabled": {
      await ensureOk(
        await admin
          .from("ride_categories")
          .update({ enabled: booleanValue(p.enabled, "enabled") })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "category.delete": {
      await ensureOk(await admin.from("ride_categories").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "category.reorder": {
      if (!Array.isArray(p.updates) || p.updates.length < 1 || p.updates.length > 100) {
        fail("invalid_updates");
      }
      for (const raw of p.updates) {
        const item = object(raw);
        await ensureOk(
          await admin
            .from("ride_categories")
            .update({
              sort_order: integer(item.sort_order, "sort_order", 0, 9999),
            })
            .eq("id", uuid(item.id)),
        );
      }
      return { ok: true };
    }
    case "pricing.upsert": {
      if (!Array.isArray(p.rows) || p.rows.length < 1 || p.rows.length > 200) fail("invalid_rows");
      const rows = p.rows.map((raw) => {
        const row = object(raw);
        const categoryKey = text(row.category_key, "category_key", 64);
        const fieldKey = text(row.field_key, "field_key", 64);
        if (!KEY_RE.test(categoryKey) || !KEY_RE.test(fieldKey)) fail("invalid_key");
        return {
          category_key: categoryKey,
          field_key: fieldKey,
          value: numberValue(row.value, "value"),
        };
      });
      await ensureOk(
        await admin.from("tariff_rules").upsert(rows, { onConflict: "category_key,field_key" }),
      );
      return { ok: true, count: rows.length };
    }
    case "pricing.delete": {
      await ensureOk(await admin.from("tariff_rules").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "coupon.create": {
      const code = text(p.code, "code", 40, 2).toUpperCase();
      await ensureOk(
        await admin.from("coupons").insert({ code, type: "percent", value: 10, enabled: true }),
      );
      return { ok: true };
    }
    case "coupon.update": {
      const id = uuid(p.id);
      const type = enumValue(p.type, "type", COUPON_TYPES);
      await ensureOk(
        await admin
          .from("coupons")
          .update({
            code: text(p.code, "code", 40, 2).toUpperCase(),
            description: optionalText(p.description, "description", 500),
            type,
            value: numberValue(p.value, "value"),
            max_discount:
              p.max_discount === null || p.max_discount === undefined
                ? null
                : numberValue(p.max_discount, "max_discount"),
            valid_from: isoOrNull(p.valid_from, "valid_from"),
            valid_to: isoOrNull(p.valid_to, "valid_to"),
            usage_limit:
              p.usage_limit === null || p.usage_limit === undefined
                ? null
                : integer(p.usage_limit, "usage_limit"),
            scope_category: optionalText(p.scope_category, "scope_category", 64),
            enabled: booleanValue(p.enabled, "enabled"),
          })
          .eq("id", id),
      );
      return { ok: true };
    }
    case "coupon.set_enabled": {
      await ensureOk(
        await admin
          .from("coupons")
          .update({ enabled: booleanValue(p.enabled, "enabled") })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "coupon.delete": {
      await ensureOk(await admin.from("coupons").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "driver.update_approval_status": {
      const id = uuid(p.id);
      const status = enumValue(p.status, "status", APPROVAL_STATUSES);
      const reason = optionalText(p.reason, "reason", 500);
      const patch: JsonMap = {
        approval_status: status,
        motivo_reprovacao: status === "reprovado" ? reason : null,
        approved_at: status === "aprovado" ? new Date().toISOString() : null,
        blocked_at: status === "bloqueado" ? new Date().toISOString() : null,
      };
      if (status === "aprovado") patch.documents_status = "approved";
      if (status === "reprovado") patch.documents_status = "rejected";
      await ensureOk(await admin.from("drivers").update(patch).eq("id", id));
      return { ok: true, patch };
    }
    case "driver.set_suspension": {
      const patch = {
        suspended_at: booleanValue(p.suspend, "suspend") ? new Date().toISOString() : null,
      };
      await ensureOk(await admin.from("drivers").update(patch).eq("id", uuid(p.id)));
      return { ok: true, patch };
    }
    case "driver.subscription_update": {
      const id = uuid(p.id);
      const patch = {
        subscription_status: enumValue(
          p.subscription_status,
          "subscription_status",
          SUBSCRIPTION_STATUSES,
        ),
        payment_status: enumValue(p.payment_status, "payment_status", PAYMENT_STATUSES),
        subscription_expires_at: isoOrNull(p.subscription_expires_at, "subscription_expires_at"),
        subscription_grace_days: integer(
          p.subscription_grace_days,
          "subscription_grace_days",
          0,
          90,
        ),
        subscription_admin_note: optionalText(
          p.subscription_admin_note,
          "subscription_admin_note",
          1000,
        ),
      };
      const { data, error } = await admin
        .from("drivers")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) fail(error.message, 422);
      if (!data) fail("driver_not_found", 404);
      return data;
    }
    case "driver.note_add": {
      const { data, error } = await admin
        .from("admin_driver_notes")
        .insert({
          driver_id: uuid(p.driverId, "driverId"),
          admin_id: actorId,
          note: text(p.note, "note", 2000),
        })
        .select("*")
        .single();
      if (error) fail(error.message, 422);
      return data;
    }
    case "driver.note_delete": {
      await ensureOk(await admin.from("admin_driver_notes").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "driver.documents_signed_urls": {
      const { data: driver, error } = await admin
        .from("drivers")
        .select("selfie_url,cnh_url,vehicle_document_url")
        .eq("id", uuid(p.driverId, "driverId"))
        .maybeSingle();
      if (error) fail(error.message, 422);
      if (!driver) fail("driver_not_found", 404);
      const buckets = {
        selfie_url: "driver-selfies",
        cnh_url: "driver-cnh",
        vehicle_document_url: "vehicle-documents",
      } as const;
      const out: Record<string, string | null> = {
        selfie_url: null,
        cnh_url: null,
        vehicle_document_url: null,
      };
      for (const [field, bucket] of Object.entries(buckets)) {
        const path = driver[field as keyof typeof driver] as string | null;
        if (!path) continue;
        const signed = await admin.storage.from(bucket).createSignedUrl(path, 600);
        if (!signed.error) out[field] = signed.data?.signedUrl ?? null;
      }
      return out;
    }
    case "passenger.suspend": {
      await ensureOk(
        await admin
          .from("users")
          .update({
            suspended_at: new Date().toISOString(),
            block_reason: optionalText(p.reason, "reason", 500),
          })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "passenger.unsuspend": {
      await ensureOk(
        await admin
          .from("users")
          .update({ suspended_at: null, block_reason: null })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "passenger.block": {
      await ensureOk(
        await admin
          .from("users")
          .update({
            blocked_at: new Date().toISOString(),
            block_reason: text(p.reason, "reason", 500),
          })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "passenger.unblock": {
      await ensureOk(
        await admin
          .from("users")
          .update({ blocked_at: null, block_reason: null })
          .eq("id", uuid(p.id)),
      );
      return { ok: true };
    }
    case "passenger.note_add": {
      const { data, error } = await admin
        .from("admin_passenger_notes")
        .insert({
          passenger_id: uuid(p.passengerId, "passengerId"),
          admin_id: actorId,
          note: text(p.note, "note", 2000),
        })
        .select("*")
        .single();
      if (error) fail(error.message, 422);
      return data;
    }
    case "passenger.note_delete": {
      await ensureOk(await admin.from("admin_passenger_notes").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "admin.role_grant": {
      const role = enumValue(p.role, "role", ASSIGNABLE_ROLES);
      const { error } = await admin
        .from("user_roles")
        .upsert({ user_id: uuid(p.userId, "userId"), role }, { onConflict: "user_id,role" });
      if (error) fail(error.message, 422);
      return { ok: true };
    }
    case "admin.role_revoke": {
      const userId = uuid(p.userId, "userId");
      const role = enumValue(p.role, "role", ASSIGNABLE_ROLES);
      if (userId === actorId && (role === "admin" || role === "super_admin")) {
        fail("cannot_revoke_self_admin", 409);
      }
      await ensureOk(
        await admin.from("user_roles").delete().eq("user_id", userId).eq("role", role),
      );
      return { ok: true };
    }
    case "notification.broadcast": {
      const title = text(p.title, "title", 120);
      const body = text(p.body, "body", 2000);
      const audience = enumValue(p.audience, "audience", AUDIENCES);
      const filter = optionalText(p.filter, "filter", 120);
      const recipients = Array.from(new Set(await resolveRecipients(admin, audience, filter)));
      if (recipients.length === 0) fail("no_recipients");
      if (recipients.length > MAX_RECIPIENTS) fail("too_many_recipients");
      for (let i = 0; i < recipients.length; i += INSERT_BATCH) {
        const rows = recipients.slice(i, i + INSERT_BATCH).map((user_id) => ({
          user_id,
          title,
          body,
          category: "admin",
          data: { audience, filter },
        }));
        await ensureOk(await admin.from("notification_inbox").insert(rows));
      }
      await ensureOk(
        await admin.from("notifications_broadcast").insert({
          title,
          body,
          audience_type: audience,
          audience_filter: filter ? { value: filter } : null,
          sent_by: actorId,
          delivery_count: recipients.length,
        }),
      );
      return { ok: true, delivered: recipients.length };
    }
    case "download.source_signed_url": {
      const signed = await admin.storage
        .from("downloads")
        .createSignedUrl("movvi-drive-source.zip", 300, {
          download: "movvi-drive-source.zip",
        });
      if (signed.error || !signed.data?.signedUrl) fail("file_unavailable", 404);
      return { url: signed.data.signedUrl };
    }
    case "subscription.plan_create": {
      const { data, error } = await admin
        .from("subscription_plans")
        .insert({
          name: text(p.name, "name", 100),
          price: numberValue(p.price, "price"),
          promotional_price:
            p.promotional_price === null || p.promotional_price === undefined
              ? null
              : numberValue(p.promotional_price, "promotional_price"),
          billing_cycle_days: integer(p.billing_cycle_days, "billing_cycle_days", 1, 365),
          grace_period_days: integer(p.grace_period_days, "grace_period_days", 0, 90),
          enabled: booleanValue(p.enabled, "enabled"),
        })
        .select("*")
        .single();
      if (error) fail(error.message, 422);
      return data;
    }
    case "subscription.plan_update": {
      const id = uuid(p.id);
      await ensureOk(
        await admin
          .from("subscription_plans")
          .update({
            name: text(p.name, "name", 100),
            price: numberValue(p.price, "price"),
            promotional_price:
              p.promotional_price === null || p.promotional_price === undefined
                ? null
                : numberValue(p.promotional_price, "promotional_price"),
            billing_cycle_days: integer(p.billing_cycle_days, "billing_cycle_days", 1, 365),
            grace_period_days: integer(p.grace_period_days, "grace_period_days", 0, 90),
            enabled: booleanValue(p.enabled, "enabled"),
          })
          .eq("id", id),
      );
      return { ok: true };
    }
    case "subscription.plan_delete": {
      const id = uuid(p.id);
      const { count, error: countError } = await admin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", id);
      if (countError) fail(countError.message, 422);
      if ((count ?? 0) > 0) fail("plan_in_use", 409);
      await ensureOk(await admin.from("subscription_plans").delete().eq("id", id));
      return { ok: true };
    }
    case "subscription.note_add": {
      const { data, error } = await admin
        .from("admin_subscription_notes")
        .insert({
          subscription_id: uuid(p.subscriptionId, "subscriptionId"),
          admin_user_id: actorId,
          note: text(p.note, "note", 2000),
        })
        .select("id,note,admin_user_id,created_at")
        .single();
      if (error) fail(error.message, 422);
      return data;
    }
    case "subscription.note_delete": {
      await ensureOk(await admin.from("admin_subscription_notes").delete().eq("id", uuid(p.id)));
      return { ok: true };
    }
    case "subscription.auto_suspend": {
      const { data, error } = await admin
        .from("subscriptions")
        .select("id,period_end,grace_until")
        .eq("status", "active")
        .eq("auto_suspend", true)
        .limit(5000);
      if (error) fail(error.message, 422);
      const now = Date.now();
      const expiredIds = (data ?? [])
        .filter((row) => {
          const deadline = row.grace_until ?? row.period_end;
          return deadline && Date.parse(deadline) < now;
        })
        .map((row) => row.id as string);
      if (expiredIds.length) {
        await ensureOk(
          await admin
            .from("subscriptions")
            .update({ status: "overdue", updated_at: new Date().toISOString() })
            .in("id", expiredIds),
        );
      }
      return { ok: true, updated: expiredIds.length };
    }
    case "support.reply": {
      const ticketId = uuid(p.ticketId, "ticketId");
      const message = text(p.message, "message", 4000);
      const { data: ticket, error: ticketError } = await admin
        .from("support_tickets")
        .select("id,user_id")
        .eq("id", ticketId)
        .maybeSingle();
      if (ticketError) fail(ticketError.message, 422);
      if (!ticket) fail("ticket_not_found", 404);

      const { data: reply, error: replyError } = await admin
        .from("support_ticket_replies")
        .insert({
          ticket_id: ticketId,
          user_id: ticket.user_id,
          admin_id: actorId,
          message,
        })
        .select("id,created_at")
        .single();
      if (replyError) fail(replyError.message, 422);
      await ensureOk(
        await admin
          .from("support_tickets")
          .update({
            status: "answered",
            admin_status_note: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticketId),
      );
      await ensureOk(
        await admin.from("notification_inbox").insert({
          user_id: ticket.user_id,
          title: "Resposta do suporte MOVVI",
          body: message,
          category: "support",
          data: { ticket_id: ticketId, reply_id: reply.id },
        }),
      );
      return { id: reply.id, created_at: reply.created_at };
    }
    case "integration.health": {
      const { data: lastEvent } = await admin
        .from("driver_payment_events")
        .select("event_type,status,created_at")
        .eq("provider", "mercadopago")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: lastReceipt } = await admin
        .from("payment_webhook_receipts")
        .select("status,detail,created_at,processed_at")
        .eq("provider", "mercadopago")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        supabase_project: new URL(SUPABASE_URL).hostname.split(".")[0],
        mercadopago_token_configured: Boolean(Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim()),
        mercadopago_webhook_secret_configured: Boolean(
          Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim(),
        ),
        unsigned_webhooks_enabled: false,
        last_payment_event: lastEvent ?? null,
        last_webhook_receipt: lastReceipt ?? null,
      };
    }
    default:
      fail("unknown_action", 404);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer "))
      return json(req, { ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const userId = userResult.user?.id;
    if (userError || !userId) return json(req, { ok: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRows, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ADMIN_ROLES)
      .limit(1);
    if (roleError) return json(req, { ok: false, error: "role_check_failed" }, 500);
    if (!roleRows?.length) return json(req, { ok: false, error: "forbidden" }, 403);

    let requestBody: { action?: unknown; payload?: unknown };
    try {
      requestBody = await req.json();
    } catch {
      return json(req, { ok: false, error: "invalid_json" }, 400);
    }
    const action = text(requestBody.action, "action", 100);
    const data = await runAction(admin, userId, action, requestBody.payload ?? {});
    const payload = object(requestBody.payload ?? {});
    const entityId =
      typeof payload.id === "string"
        ? payload.id
        : typeof payload.driverId === "string"
          ? payload.driverId
          : typeof payload.ticketId === "string"
            ? payload.ticketId
            : null;
    const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const auditResult = await admin.from("admin_audit_logs").insert({
      actor_id: userId,
      action,
      entity: action.split(".")[0] || "admin",
      entity_id: entityId,
      after: { action_completed: true },
      ip: forwardedFor || req.headers.get("cf-connecting-ip") || null,
      source: "server",
    });
    if (auditResult.error) {
      console.error("[admin-actions] audit_failed", auditResult.error.message);
    }
    return json(req, { ok: true, data });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: unknown }).status) || 400
        : 400;
    const message = error instanceof Error ? error.message : "admin_action_failed";
    console.error("[admin-actions]", message);
    return json(req, { ok: false, error: message }, status);
  }
});
