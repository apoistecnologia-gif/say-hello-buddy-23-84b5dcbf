import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const inputSchema = z.object({
  action: z.enum([
    "status",
    "accept",
    "reject",
    "arrive",
    "start",
    "complete",
    "cancel",
    "rate",
    "confirm_payment",
  ]),
  rideId: z.string().uuid(),
  safety_code: z.string().trim().regex(/^\d{4}$/).optional(),
  motivo: z.string().trim().max(500).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(500).nullable().optional(),
});

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function userClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Supabase server configuration missing.");
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function invokeDriverWorkflow(
  token: string,
  slug: "driver-reject-redispatch" | "driver-cancel-redispatch" | "driver-finish-redispatch",
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Supabase server configuration missing.");

  const response = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { status: response.status, payload };
}

function rpcFailure(error: { message?: string } | null) {
  const message = error?.message || "Falha na ação da corrida.";
  const status = /unauthorized|not_approved|suspended|offline|subscription|not_assigned/i.test(message)
    ? 403
    : /invalid|unavailable|busy|locked|location|distance|pickup|not_completed|cash_payment_only/i.test(message)
    ? 409
    : 500;
  return json({ ok: false, error: message, code: "DRIVER_RIDE_ACTION_FAILED" }, status);
}

export const Route = createFileRoute("/api/driver/rides/action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearer(request);
        if (!token) return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);

        let input: z.infer<typeof inputSchema>;
        try {
          input = inputSchema.parse(await request.json());
        } catch (error) {
          return json({ ok: false, error: "Dados da ação inválidos.", detail: String(error) }, 400);
        }

        try {
          const client = userClient(token);
          const { data: authData, error: authError } = await client.auth.getUser(token);
          if (authError || !authData.user) {
            return json({ ok: false, error: "Sessão inválida. Entre novamente." }, 401);
          }

          if (input.action === "status") {
            const { data, error } = await client
              .from("rides")
              .select("*")
              .eq("id", input.rideId)
              .maybeSingle();
            if (error) return rpcFailure(error);
            if (!data) return json({ ok: false, error: "Corrida não encontrada ou sem acesso." }, 404);
            return json({ ok: true, data });
          }

          if (input.action === "reject") {
            const result = await invokeDriverWorkflow(token, "driver-reject-redispatch", {
              ride_id: input.rideId,
            });
            return json(result.payload, result.status);
          }

          if (input.action === "cancel") {
            const result = await invokeDriverWorkflow(token, "driver-cancel-redispatch", {
              ride_id: input.rideId,
              reason: input.motivo || "Cancelamento solicitado pelo motorista.",
            });
            return json(result.payload, result.status);
          }

          if (input.action === "complete") {
            const result = await invokeDriverWorkflow(token, "driver-finish-redispatch", {
              ride_id: input.rideId,
            });
            return json(result.payload, result.status);
          }

          if (input.action === "accept") {
            const { data, error } = await client.rpc("driver_accept_ride", {
              _ride_id: input.rideId,
            });
            if (error) return rpcFailure(error);
            return json({ ok: true, data });
          }

          if (input.action === "arrive") {
            const { data, error } = await client.rpc("driver_mark_arrived", {
              _ride_id: input.rideId,
            });
            if (error) return rpcFailure(error);
            return json({ ok: true, data });
          }

          if (input.action === "start") {
            if (!input.safety_code) {
              return json({ ok: false, error: "Informe o código de segurança." }, 422);
            }
            const { data, error } = await client.rpc("driver_start_ride", {
              _ride_id: input.rideId,
              _security_code: input.safety_code,
            });
            if (error) return rpcFailure(error);
            return json({ ok: true, data });
          }

          if (input.action === "confirm_payment") {
            const { data, error } = await client.rpc("driver_confirm_cash_payment", {
              _ride_id: input.rideId,
            });
            if (error) return rpcFailure(error);
            return json({ ok: true, data });
          }

          if (!input.stars) {
            return json({ ok: false, error: "Escolha uma nota de 1 a 5." }, 422);
          }
          const { data, error } = await client.rpc("driver_rate_passenger", {
            _ride_id: input.rideId,
            _stars: input.stars,
            _comment: input.comment ?? null,
          });
          if (error) return rpcFailure(error);
          return json({ ok: true, data });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha na ação da corrida.";
          console.error("[driver-rides-action]", {
            action: input.action,
            rideId: input.rideId,
            message,
          });
          return json({ ok: false, error: message, code: "DRIVER_RIDE_ACTION_FAILED" }, 500);
        }
      },
    },
  },
});
