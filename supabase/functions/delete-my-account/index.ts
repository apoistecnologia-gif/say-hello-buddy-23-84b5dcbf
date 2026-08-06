import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : {}),
      "content-type": "application/json",
    },
  });
}

async function removeStorageFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  folder: string,
): Promise<void> {
  while (true) {
    const listed = await admin.storage.from(bucket).list(folder, { limit: 100, offset: 0 });
    if (listed.error) {
      if (/bucket not found/i.test(listed.error.message)) return;
      throw new Error(`storage_list_${bucket}:${listed.error.message}`);
    }
    const files = (listed.data ?? [])
      .filter((item) => item.id)
      .map((item) => `${folder}/${item.name}`);
    if (!files.length) return;
    const removed = await admin.storage.from(bucket).remove(files);
    if (removed.error) throw new Error(`storage_remove_${bucket}:${removed.error.message}`);
    if ((listed.data ?? []).length < 100) return;
  }
}

async function deleteRowsForIdentities(
  admin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  identities: string[],
): Promise<void> {
  const result = await admin.from(table).delete().in(column, identities);
  if (!result.error) return;
  if (result.error.code === "42P01" || /does not exist/i.test(result.error.message)) return;
  throw new Error(`delete_${table}:${result.error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return json({ error: "unauthorized" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const authUserId = auth.user?.id;
  if (authError || !authUserId) return json({ error: "unauthorized" }, 401, req);

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,deleted_at")
    .or(`auth_user_id.eq.${authUserId},id.eq.${authUserId}`)
    .limit(1)
    .maybeSingle();
  if (profileError || !profile) return json({ error: "passenger_profile_missing" }, 404, req);
  if (profile.deleted_at) return json({ ok: true, already_deleted: true }, 200, req);

  const profileId = profile.id;
  const identities = [...new Set([authUserId, profileId])];

  const { data: driver, error: driverError } = await admin
    .from("drivers")
    .select("id,user_id")
    .eq("user_id", profileId)
    .maybeSingle();
  if (driverError) return json({ error: "driver_lookup_failed" }, 500, req);

  let activeRideQuery = admin
    .from("rides")
    .select("id,status")
    .in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .limit(1);
  activeRideQuery = driver
    ? activeRideQuery.or(`passenger_id.eq.${profileId},driver_id.eq.${driver.id}`)
    : activeRideQuery.eq("passenger_id", profileId);

  const { data: activeRide, error: rideError } = await activeRideQuery.maybeSingle();
  if (rideError) return json({ error: "active_ride_check_failed" }, 500, req);
  if (activeRide) {
    return json(
      {
        error: "active_ride_exists",
        message: "Finalize ou cancele a corrida ativa antes de excluir a conta.",
      },
      409,
      req,
    );
  }

  const role = driver ? "motorista" : "passageiro";
  const requestInsert = await admin
    .from("account_deletion_requests")
    .insert({ user_id: profileId, role, status: "requested" })
    .select("id")
    .single();
  if (requestInsert.error || !requestInsert.data) {
    return json({ error: "deletion_request_failed" }, 500, req);
  }
  const requestId = requestInsert.data.id;

  try {
    const storageFolders = identities.flatMap((identity) =>
      ["profile-photos", "driver-selfies", "driver-cnh", "vehicle-documents"].map(
        (bucket) => ({ bucket, identity }),
      ),
    );
    await Promise.all(
      storageFolders.map(({ bucket, identity }) => removeStorageFolder(admin, bucket, identity)),
    );

    for (const [table, column] of [
      ["user_notification_tokens", "user_id"],
      ["user_notification_preferences", "user_id"],
      ["notifications", "user_id"],
      ["notification_inbox", "user_id"],
      ["favorite_places", "user_id"],
      ["recent_places", "user_id"],
      ["favorite_drivers", "passenger_id"],
      ["passenger_emergency_contacts", "passenger_user_id"],
      ["driver_emergency_contacts", "driver_user_id"],
      ["driver_preferences", "user_id"],
      ["driver_amenities", "user_id"],
      ["driver_public_locations", "user_id"],
      ["gps_diagnostics", "user_id"],
    ] as const) {
      await deleteRowsForIdentities(admin, table, column, identities);
    }
    await deleteRowsForIdentities(admin, "favorite_drivers", "driver_id", identities);

    const deletedEmail = `deleted+${authUserId}@apois.invalid`;
    const now = new Date().toISOString();
    const userUpdate = await admin
      .from("users")
      .update({
        name: "Conta excluída",
        email: deletedEmail,
        phone: null,
        cpf: null,
        avatar_url: null,
        birth_date: null,
        gender: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        preferences: {},
        blocked_at: now,
        block_reason: "account_deleted",
        deleted_at: now,
        updated_at: now,
      })
      .eq("id", profileId);
    if (userUpdate.error) throw new Error(`anonymize_user:${userUpdate.error.message}`);

    if (driver) {
      const driverUpdate = await admin
        .from("drivers")
        .update({
          name: "Conta excluída",
          email: deletedEmail,
          phone: "00000000000",
          cpf: authUserId.replaceAll("-", "").slice(0, 11),
          birth_date: null,
          city: "Excluída",
          state: "EX",
          vehicle_model: "Removido",
          vehicle_color: "Removido",
          vehicle_plate: "EXCLUIDO",
          is_online: false,
          current_lat: null,
          current_lng: null,
          current_heading: null,
          current_speed: null,
          last_location_at: null,
          photo_url: null,
          selfie_url: null,
          cnh_url: null,
          cnh_back_url: null,
          vehicle_document_url: null,
          vehicle_photo_url: null,
          insurance_url: null,
          pix_key: null,
          pix_key_type: null,
          pix_holder_name: null,
          mercadopago_payer_id: null,
          mercadopago_preapproval_id: null,
          mercadopago_init_point: null,
          asaas_customer_id: null,
          asaas_subscription_id: null,
          last_invoice_url: null,
          blocked_at: now,
          updated_at: now,
        })
        .eq("id", driver.id);
      if (driverUpdate.error) throw new Error(`anonymize_driver:${driverUpdate.error.message}`);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId, true);
    if (deleteError) throw deleteError;

    const completed = await admin
      .from("account_deletion_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", requestId);
    if (completed.error) throw new Error(`complete_request:${completed.error.message}`);

    return json({ ok: true }, 200, req);
  } catch (error) {
    await admin
      .from("account_deletion_requests")
      .update({ status: "failed", reason: String(error).slice(0, 500) })
      .eq("id", requestId);
    console.error("[delete-my-account]", error);
    return json(
      {
        error: "account_deletion_failed",
        message: "Não foi possível concluir a exclusão agora. Tente novamente mais tarde.",
      },
      500,
      req,
    );
  }
});
