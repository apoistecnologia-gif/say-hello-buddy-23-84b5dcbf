import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : {}), "content-type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 ? digits : null;
}

function cleanDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date > new Date()) return null;
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveProfile(admin: ReturnType<typeof createClient>, authUserId: string) {
  const { data, error } = await admin
    .from("users")
    .select("id,auth_user_id,name,email,phone,avatar_url,city,cpf,birth_date,gender,average_rating,total_ratings,completed_rides,preferences,created_at,updated_at,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`profile_lookup_failed:${error.message}`);
  return data;
}

async function loadCenter(admin: ReturnType<typeof createClient>, profile: Record<string, unknown>) {
  const profileId = String(profile["id"]);
  const [contactsResult, preferencesResult] = await Promise.all([
    admin
      .from("passenger_emergency_contacts")
      .select("id,name,phone,relationship,is_primary,created_at,updated_at")
      .eq("passenger_id", profileId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    admin
      .from("user_notification_preferences")
      .select("ride_updates,promotions,safety_alerts,payment_updates,accessibility_large_text")
      .eq("user_id", profileId)
      .maybeSingle(),
  ]);

  if (contactsResult.error) throw new Error(`contacts_read_failed:${contactsResult.error.message}`);
  if (preferencesResult.error) throw new Error(`preferences_read_failed:${preferencesResult.error.message}`);

  const rawPreferences = isRecord(profile["preferences"])
    ? profile["preferences"] as Record<string, unknown>
    : {};
  const databasePreferences = preferencesResult.data ?? {};

  return {
    ok: true,
    profile: {
      id: profileId,
      name: profile["name"] ?? null,
      email: profile["email"] ?? null,
      phone: profile["phone"] ?? null,
      avatarUrl: profile["avatar_url"] ?? null,
      city: profile["city"] ?? null,
      cpf: profile["cpf"] ?? null,
      birthDate: profile["birth_date"] ?? null,
      gender: profile["gender"] ?? null,
      averageRating: profile["average_rating"] ?? null,
      totalRatings: profile["total_ratings"] ?? 0,
      completedRides: profile["completed_rides"] ?? 0,
      createdAt: profile["created_at"] ?? null,
      updatedAt: profile["updated_at"] ?? null,
    },
    preferences: {
      rideUpdates: databasePreferences.ride_updates ?? true,
      promotions: databasePreferences.promotions ?? false,
      safetyAlerts: databasePreferences.safety_alerts ?? true,
      paymentUpdates: databasePreferences.payment_updates ?? true,
      accessibilityLargeText:
        databasePreferences.accessibility_large_text ?? rawPreferences["accessibility_large_text"] === true,
    },
    emergencyContacts: contactsResult.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "method_not_allowed" }, 405, req);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData.user;
  if (authError || !authUser) return json({ error: "unauthorized" }, 401, req);

  const profile = await resolveProfile(admin, authUser.id);
  if (!profile || profile.deleted_at) return json({ error: "passenger_profile_missing" }, 404, req);
  const profileId = profile.id;

  if (req.method === "GET") return json(await loadCenter(admin, profile), 200, req);

  let input: Record<string, unknown>;
  try {
    const parsed = await req.json();
    input = isRecord(parsed) ? parsed : {};
  } catch {
    return json({ error: "invalid_json" }, 400, req);
  }

  const action = String(input["action"] ?? "");

  try {
    if (action === "update_profile") {
      const name = cleanText(input["name"], 120);
      const phone = cleanPhone(input["phone"]);
      const city = cleanText(input["city"], 100);
      const birthDate = input["birthDate"] ? cleanDate(input["birthDate"]) : null;
      const gender = cleanText(input["gender"], 40);
      if (!name || !phone) return json({ error: "invalid_profile", message: "Informe um nome e telefone válidos." }, 422, req);
      if (input["birthDate"] && !birthDate) return json({ error: "invalid_birth_date" }, 422, req);

      const { error } = await admin.from("users").update({
        name, phone, city, birth_date: birthDate, gender, updated_at: new Date().toISOString(),
      }).eq("id", profileId);
      if (error) throw new Error(`profile_update_failed:${error.message}`);
    } else if (action === "update_preferences") {
      const accessibilityLargeText = input["accessibilityLargeText"] === true;
      const { error } = await admin.from("user_notification_preferences").upsert({
        user_id: profileId,
        ride_updates: input["rideUpdates"] !== false,
        promotions: input["promotions"] === true,
        safety_alerts: input["safetyAlerts"] !== false,
        payment_updates: input["paymentUpdates"] !== false,
        accessibility_large_text: accessibilityLargeText,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw new Error(`preferences_update_failed:${error.message}`);

      const currentPreferences = isRecord(profile.preferences) ? profile.preferences : {};
      const { error: profileError } = await admin.from("users").update({
        preferences: { ...currentPreferences, accessibility_large_text: accessibilityLargeText },
        updated_at: new Date().toISOString(),
      }).eq("id", profileId);
      if (profileError) throw new Error(`profile_preferences_update_failed:${profileError.message}`);
    } else if (action === "save_emergency_contact") {
      const contactId = cleanText(input["id"], 60);
      const name = cleanText(input["name"], 100);
      const phone = cleanPhone(input["phone"]);
      const relationship = cleanText(input["relationship"], 60);
      const isPrimary = input["isPrimary"] === true;
      if (!name || !phone) return json({ error: "invalid_contact" }, 422, req);

      if (!contactId) {
        const { count, error } = await admin.from("passenger_emergency_contacts")
          .select("id", { count: "exact", head: true }).eq("passenger_id", profileId);
        if (error) throw new Error(`contact_count_failed:${error.message}`);
        if ((count ?? 0) >= 3) return json({ error: "contact_limit_reached" }, 409, req);
      }

      if (isPrimary) {
        const { error } = await admin.from("passenger_emergency_contacts")
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq("passenger_id", profileId).eq("is_primary", true);
        if (error) throw new Error(`primary_contact_reset_failed:${error.message}`);
      }

      if (contactId) {
        const { error } = await admin.from("passenger_emergency_contacts")
          .update({ name, phone, relationship, is_primary: isPrimary, updated_at: new Date().toISOString() })
          .eq("id", contactId).eq("passenger_id", profileId);
        if (error) throw new Error(`contact_update_failed:${error.message}`);
      } else {
        const { error } = await admin.from("passenger_emergency_contacts")
          .insert({ passenger_id: profileId, name, phone, relationship, is_primary: isPrimary });
        if (error) throw new Error(`contact_insert_failed:${error.message}`);
      }
    } else if (action === "delete_emergency_contact") {
      const contactId = cleanText(input["id"], 60);
      if (!contactId) return json({ error: "invalid_contact_id" }, 422, req);
      const { error } = await admin.from("passenger_emergency_contacts")
        .delete().eq("id", contactId).eq("passenger_id", profileId);
      if (error) throw new Error(`contact_delete_failed:${error.message}`);
    } else {
      return json({ error: "unsupported_action" }, 422, req);
    }

    const refreshed = await resolveProfile(admin, authUser.id);
    if (!refreshed) throw new Error("profile_refresh_failed");
    return json(await loadCenter(admin, refreshed), 200, req);
  } catch (error) {
    console.error("[passenger-profile]", error);
    return json({ error: "profile_action_failed", message: "Não foi possível salvar as alterações agora." }, 500, req);
  }
});
