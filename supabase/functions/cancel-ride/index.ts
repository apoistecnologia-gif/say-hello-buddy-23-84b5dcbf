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

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
    if (req.method !== "POST") return json({ ok: false, error_code: "method_not_allowed" }, 405, req);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const authUserId = authData.user?.id;
    if (authError || !authUserId) return json({ ok: false, error_code: "unauthorized" }, 401, req);

    const { data: passenger, error: passengerError } = await admin
      .from("users")
      .select("id,deleted_at")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (passengerError || !passenger || passenger.deleted_at) {
      return json({ ok: false, error_code: "passenger_profile_missing" }, 404, req);
    }

    const body = (await req.json()) as { ride_id?: unknown; reason?: unknown };
    const rideId = String(body.ride_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rideId)) {
      return json({ ok: false, error_code: "invalid_ride_id", message: "Corrida inválida." }, 422, req);
    }

    const { data: ride, error: rideError } = await admin
      .from("rides")
      .select("id,passenger_id,status,accepted_at,created_at,cancellation_fee")
      .eq("id", rideId)
      .eq("passenger_id", passenger.id)
      .maybeSingle();
    if (rideError) return json({ ok: false, error_code: "ride_lookup_failed" }, 500, req);
    if (!ride) return json({ ok: false, error_code: "ride_not_found", message: "Corrida não encontrada." }, 404, req);

    if (["finalizada", "cancelada_passageiro", "cancelada_motorista", "expired"].includes(String(ride.status))) {
      return json({ ok: true, status: ride.status, cancellation_fee: Number(ride.cancellation_fee ?? 0), message: "A corrida já está encerrada." }, 200, req);
    }
    if (["motorista_chegou", "em_viagem"].includes(String(ride.status))) {
      return json({ ok: false, error_code: "cancellation_not_allowed", status: ride.status, message: "Não é possível cancelar depois que o motorista chegou ao local de embarque." }, 409, req);
    }
    if (!["procurar_motorista", "motorista_a_caminho", "agendada"].includes(String(ride.status))) {
      return json({ ok: false, error_code: "invalid_ride_status", status: ride.status }, 409, req);
    }

    const { data: settingsRows } = await admin
      .from("app_settings")
      .select("key,value")
      .in("key", ["ride.cancellation_free_minutes", "ride.cancellation_fee_amount"]);
    const settings = new Map((settingsRows ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
    const freeMinutes = readNumber(settings.get("ride.cancellation_free_minutes"), 2);
    const configuredFee = readNumber(settings.get("ride.cancellation_fee_amount"), 5);
    const elapsedMinutes = Math.max(0, (Date.now() - new Date(ride.accepted_at ?? ride.created_at).getTime()) / 60000);
    const fee = ride.status === "motorista_a_caminho" && elapsedMinutes > freeMinutes
      ? Math.round(configuredFee * 100) / 100
      : 0;
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : "Cancelada pelo passageiro";
    const now = new Date().toISOString();

    const { data: updatedRide, error: updateError } = await admin
      .from("rides")
      .update({
        status: "cancelada_passageiro",
        cancelled_by: "passenger",
        cancellation_reason: reason,
        cancellation_fee: fee,
        cancelled_at: now,
        updated_at: now,
      })
      .eq("id", rideId)
      .eq("passenger_id", passenger.id)
      .in("status", ["procurar_motorista", "motorista_a_caminho", "agendada"])
      .select("id,status,cancellation_fee")
      .maybeSingle();
    if (updateError) return json({ ok: false, error_code: "ride_cancel_failed" }, 500, req);
    if (!updatedRide) return json({ ok: false, error_code: "ride_status_changed" }, 409, req);

    if (fee > 0) {
      const { error: feeError } = await admin.from("cancellation_fees").upsert({
        ride_id: rideId,
        passenger_id: passenger.id,
        amount: fee,
        reason,
        status: "pending",
        updated_at: now,
      }, { onConflict: "ride_id" });
      if (feeError) return json({ ok: false, error_code: "cancellation_fee_create_failed" }, 500, req);

      const { error: walletError } = await admin.from("passenger_wallets").upsert({
        passenger_id: passenger.id,
        is_blocked: true,
        blocked_reason: `Taxa de cancelamento pendente de R$ ${fee.toFixed(2).replace(".", ",")}`,
        updated_at: now,
      }, { onConflict: "passenger_id" });
      if (walletError) return json({ ok: false, error_code: "wallet_block_failed" }, 500, req);
    }

    return json({
      ok: true,
      status: "cancelada_passageiro",
      cancellation_fee: fee,
      message: fee > 0
        ? `Corrida cancelada. Foi aplicada uma taxa de R$ ${fee.toFixed(2).replace(".", ",")}.`
        : "Corrida cancelada sem taxa.",
    }, 200, req);
  } catch (error) {
    console.error("[cancel-ride] fatal", error);
    return json({ ok: false, error_code: "internal_error" }, 500, req);
  }
});
