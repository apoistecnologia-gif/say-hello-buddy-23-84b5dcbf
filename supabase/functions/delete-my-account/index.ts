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

async function removeStorageFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  folder: string,
): Promise<void> {
  while (true) {
    const listed = await admin.storage.from(bucket).list(folder, { limit: 100, offset: 0 });
    if (listed.error) {
      if (/bucket not found/i.test(listed.error.message)) return;
      throw listed.error;
    }
    const files = (listed.data ?? [])
      .filter((item) => item.id)
      .map((item) => `${folder}/${item.name}`);
    if (!files.length) return;
    const removed = await admin.storage.from(bucket).remove(files);
    if (removed.error) throw removed.error;
    if ((listed.data ?? []).length < 100) return;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, req);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401, req);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUserId = authData.user?.id;
  if (authError || !authUserId) return json({ error: "unauthorized" }, 401, req);

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id,deleted_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (profileError || !profile) return json({ error: "passenger_profile_missing" }, 404, req);
  if (profile.deleted_at) return json({ ok: true, alreadyDeleted: true }, 200, req);

  const { data: activeRide, error: activeRideError } = await admin
    .from("rides")
    .select("id")
    .eq("passenger_id", profile.id)
    .in("status", ["procurar_motorista", "motorista_a_caminho", "motorista_chegou", "em_viagem"])
    .limit(1)
    .maybeSingle();
  if (activeRideError) return json({ error: "active_ride_check_failed" }, 500, req);
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

  const { data: requestRow, error: requestError } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: profile.id, role: "passageiro", status: "requested" })
    .select("id")
    .single();
  if (requestError || !requestRow) return json({ error: "deletion_request_failed" }, 500, req);

  try {
    await removeStorageFolder(admin, "profile-photos", authUserId);
    await removeStorageFolder(admin, "profile-photos", profile.id);

    const cleanupResults = await Promise.all([
      admin.from("user_notification_tokens").delete().eq("user_id", profile.id),
      admin.from("user_notification_preferences").delete().eq("user_id", profile.id),
      admin.from("notifications").delete().eq("user_id", profile.id),
      admin.from("passenger_emergency_contacts").delete().eq("passenger_id", profile.id),
    ]);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) throw cleanupError;

    const now = new Date().toISOString();
    const deletedEmail = `deleted+${authUserId}@apois.invalid`;
    const { error: anonymizeError } = await admin
      .from("users")
      .update({
        name: "Conta excluída",
        email: deletedEmail,
        phone: null,
        cpf: null,
        avatar_url: null,
        birth_date: null,
        gender: null,
        preferences: {},
        blocked_at: now,
        block_reason: "account_deleted",
        deleted_at: now,
        updated_at: now,
      })
      .eq("id", profile.id);
    if (anonymizeError) throw anonymizeError;

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId, true);
    if (authDeleteError) throw authDeleteError;

    const { error: completionError } = await admin
      .from("account_deletion_requests")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("id", requestRow.id);
    if (completionError) throw completionError;

    return json({ ok: true }, 200, req);
  } catch (error) {
    await admin
      .from("account_deletion_requests")
      .update({
        status: "failed",
        reason: String(error).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestRow.id);

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
