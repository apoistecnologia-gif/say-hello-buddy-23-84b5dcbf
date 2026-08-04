import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function removeStorageFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  while (true) {
    const listed = await admin.storage
      .from(bucket)
      .list(userId, { limit: 100, offset: 0 });
    if (listed.error) {
      if (/bucket not found/i.test(listed.error.message)) return;
      throw new Error(`storage_list_${bucket}:${listed.error.message}`);
    }
    const files = (listed.data ?? [])
      .filter((item) => item.id)
      .map((item) => `${userId}/${item.name}`);
    if (!files.length) return;
    if (files.length) {
      const removed = await admin.storage.from(bucket).remove(files);
      if (removed.error)
        throw new Error(`storage_remove_${bucket}:${removed.error.message}`);
    }
    if ((listed.data ?? []).length < 100) return;
  }
}

async function deleteRowsByUser(
  admin: ReturnType<typeof createClient>,
  table: string,
  column: string,
  userId: string,
) {
  const result = await admin.from(table).delete().eq(column, userId);
  if (result.error) throw new Error(`delete_${table}:${result.error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const userId = auth.user?.id;
  if (authError || !userId) return json({ error: "unauthorized" }, 401);

  const { data: activeRide, error: rideError } = await admin
    .from("rides")
    .select("id,status")
    .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
    .in("status", [
      "procurar_motorista",
      "motorista_a_caminho",
      "motorista_chegou",
      "em_viagem",
    ])
    .limit(1)
    .maybeSingle();
  if (rideError) return json({ error: "active_ride_check_failed" }, 500);
  if (activeRide)
    return json(
      {
        error: "active_ride_exists",
        message:
          "Finalize ou cancele a corrida ativa antes de excluir a conta.",
      },
      409,
    );

  const { data: driver, error: driverError } = await admin
    .from("drivers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (driverError) return json({ error: "driver_lookup_failed" }, 500);
  const role = driver ? "motorista" : "passageiro";

  const { data: requestRow, error: requestError } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: userId, role, status: "requested" })
    .select("id")
    .single();
  if (requestError || !requestRow)
    return json({ error: "deletion_request_failed" }, 500);

  try {
    await Promise.all(
      [
        "profile-photos",
        "driver-selfies",
        "driver-cnh",
        "vehicle-documents",
      ].map((bucket) => removeStorageFolder(admin, bucket, userId)),
    );

    for (const [table, column] of [
      ["user_notification_tokens", "user_id"],
      ["user_notification_preferences", "user_id"],
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
      await deleteRowsByUser(admin, table, column, userId);
    }
    await deleteRowsByUser(admin, "favorite_drivers", "driver_id", userId);

    const userUpdate = await admin
      .from("users")
      .update({
        name: "Conta excluída",
        email: `deleted+${userId}@movvi.invalid`,
        phone: null,
        cpf: null,
        avatar_url: null,
        birth_date: null,
        gender: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        preferences: {},
        blocked_at: new Date().toISOString(),
        block_reason: "account_deleted",
        deleted_at: new Date().toISOString(),
      })
      .eq("auth_user_id", userId);
    if (userUpdate.error)
      throw new Error(`anonymize_user:${userUpdate.error.message}`);
    if (driver) {
      const driverUpdate = await admin
        .from("drivers")
        .update({
          name: "Conta excluída",
          email: `deleted+${userId}@movvi.invalid`,
          phone: "00000000000",
          cpf: userId.replaceAll("-", "").slice(0, 11),
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
          blocked_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (driverUpdate.error)
        throw new Error(`anonymize_driver:${driverUpdate.error.message}`);
    }

    // Soft delete disables authentication while keeping foreign-key integrity
    // for legally required ride and financial records.
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      userId,
      true,
    );
    if (deleteError) throw deleteError;

    const completed = await admin
      .from("account_deletion_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestRow.id);
    if (completed.error)
      throw new Error(`complete_request:${completed.error.message}`);
    return json({ ok: true });
  } catch (error) {
    await admin
      .from("account_deletion_requests")
      .update({
        status: "failed",
        reason: String(error).slice(0, 500),
      })
      .eq("id", requestRow.id);
    console.error("[delete-my-account]", error);
    return json({ error: "account_deletion_failed" }, 500);
  }
});
