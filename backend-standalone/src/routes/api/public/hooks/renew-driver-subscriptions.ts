// Cron endpoint: renova mensalidades dos motoristas.
// - Motoristas com período pago vencendo em até 3 dias recebem uma nova
//   preference do Mercado Pago sem perder o período atual.
// - A cobrança nova permanece pendente, mas não bloqueia uma assinatura paga.
// Chamado via pg_cron diariamente.
// Autentica por header: Authorization: Bearer ${CRON_SECRET}.
// Requer secret dedicado CRON_SECRET. Sem ele, responde 503.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const RENEW_WINDOW_DAYS = 3;

type Driver = {
  id: string;
  user_id: string;
  next_due_date: string | null;
  financial_status: string | null;
  mercadopago_preapproval_id: string | null;
  current_period_end?: string | null;
};

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function createMpPreference(
  driver: Driver,
  mpToken: string,
  supabaseUrl: string,
  amount: number,
  planId: string | null,
) {
  const returnUrl =
    process.env.MOVVI_DRIVER_SUBSCRIPTION_RETURN_URL?.trim() ||
    "https://app.movvidriver.com.br/motorista/assinatura";
  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mpToken}`,
      "X-Idempotency-Key": `movvi-renew-${driver.id}-${new Date().toISOString().slice(0, 10)}`,
    },
    body: JSON.stringify({
      items: [
        {
          id: `mensalidade-${driver.id}`,
          title: "Mensalidade Motorista MOVVI",
          description: "Renovação mensal MOVVI",
          quantity: 1,
          currency_id: "BRL",
          unit_price: amount,
        },
      ],
      external_reference: driver.id,
      metadata: {
        driver_id: driver.id,
        user_id: driver.user_id,
        plan_id: planId,
        expected_amount: amount,
        kind: "monthly_fee",
        source: "cron_renewal",
      },
      back_urls: {
        success: returnUrl,
        failure: returnUrl,
        pending: returnUrl,
      },
      auto_return: "approved",
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MP_HTTP_${res.status}:${text.slice(0, 300)}`);
  return JSON.parse(text) as { id: string; init_point?: string; sandbox_init_point?: string };
}

export const Route = createFileRoute("/api/public/hooks/renew-driver-subscriptions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
        if (!cronSecret) {
          return new Response(JSON.stringify({ error: "cron_secret_not_configured" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!provided || !safeEqual(provided, cronSecret)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() ?? "";
        if (!MP_TOKEN) {
          return new Response(JSON.stringify({ error: "missing_mp_token" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: plan, error: planError } = await admin
          .from("subscription_plans")
          .select("id,price,promotional_price,billing_cycle_days,grace_period_days")
          .eq("enabled", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (planError) {
          return new Response(JSON.stringify({ error: "plan_lookup_failed" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        const amount = Number(plan?.promotional_price ?? plan?.price ?? 49.9);
        const billingDays = Number(plan?.billing_cycle_days ?? 30);

        const today = new Date();
        const renewCutoff = new Date(today);
        renewCutoff.setDate(renewCutoff.getDate() + RENEW_WINDOW_DAYS);
        const renewCutoffIso = renewCutoff.toISOString();

        // 1) Suspende apenas períodos que realmente venceram, segundo a fonte
        // oficial `subscriptions`.
        const overdueRun = await admin.rpc("auto_suspend_overdue_subscriptions");
        if (overdueRun.error) {
          console.error("[renew-cron] overdue update failed", overdueRun.error);
        }

        // 2) Busca períodos pagos próximos do vencimento e períodos já vencidos
        // para os quais ainda deve existir um caminho de regularização.
        const { data: dueSubscriptions, error: dueError } = await admin
          .from("subscriptions")
          .select("driver_id,period_end,status")
          .in("status", ["active", "overdue"])
          .lte("period_end", renewCutoffIso)
          .order("period_end", { ascending: true });
        if (dueError) {
          return new Response(
            JSON.stringify({
              error: "subscription_fetch_failed",
              detail: dueError.message,
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            },
          );
        }
        const dueByDriver = new Map<string, string | null>();
        for (const subscription of dueSubscriptions ?? []) {
          const driverUserId = String(subscription.driver_id ?? "");
          if (!driverUserId || dueByDriver.has(driverUserId)) continue;
          dueByDriver.set(driverUserId, subscription.period_end ?? null);
        }
        const dueDriverIds = [...dueByDriver.keys()];
        const { data: candidateRows, error: fetchErr } = dueDriverIds.length
          ? await admin
              .from("drivers")
              .select("id,user_id,next_due_date,financial_status,mercadopago_preapproval_id")
              .in("user_id", dueDriverIds)
              .eq("approval_status", "aprovado")
          : { data: [], error: null };
        const candidates = (candidateRows ?? []).map((driver) => ({
          ...driver,
          current_period_end: dueByDriver.get(String(driver.user_id)) ?? null,
        }));

        if (fetchErr) {
          console.error("[renew-cron] fetch candidates failed", fetchErr);
          return new Response(JSON.stringify({ error: "fetch_failed", detail: fetchErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const results: Array<{ driverId: string; ok: boolean; error?: string }> = [];

        for (const driver of (candidates ?? []) as Driver[]) {
          try {
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: existingPending } = await admin
              .from("subscriptions")
              .select("id,invoice_url,provider_reference")
              .eq("driver_id", driver.user_id)
              .eq("status", "pending")
              .not("invoice_url", "is", null)
              .gte("created_at", cutoff)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existingPending) {
              results.push({ driverId: driver.id, ok: true });
              continue;
            }

            const preference = await createMpPreference(
              driver,
              MP_TOKEN,
              SUPABASE_URL,
              amount,
              plan?.id ?? null,
            );
            const initPoint = preference.init_point ?? preference.sandbox_init_point ?? null;
            const periodEnd = new Date(
              Date.now() + billingDays * 24 * 60 * 60 * 1000,
            ).toISOString();
            const hasCurrentPaidPeriod =
              Boolean(driver.current_period_end) &&
              new Date(driver.current_period_end as string).getTime() > Date.now();

            await admin
              .from("drivers")
              .update({
                mercadopago_preapproval_id: preference.id,
                mercadopago_init_point: initPoint,
                ...(hasCurrentPaidPeriod
                  ? {}
                  : {
                      subscription_status: "pending",
                      financial_status: "pending",
                    }),
                last_payment_status: "PENDING",
                last_invoice_url: initPoint,
              })
              .eq("id", driver.id);

            const { data: pending } = await admin
              .from("subscriptions")
              .select("id")
              .eq("driver_id", driver.user_id)
              .eq("status", "pending")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const subscriptionPatch = {
              plan_id: plan?.id ?? null,
              status: "pending",
              amount,
              period_start: new Date().toISOString(),
              period_end: periodEnd,
              provider_reference: preference.id,
              payment_method: "checkout_pro",
              invoice_url: initPoint,
              paid_at: null,
              updated_at: new Date().toISOString(),
            };
            const subscriptionWrite = pending
              ? await admin.from("subscriptions").update(subscriptionPatch).eq("id", pending.id)
              : await admin.from("subscriptions").insert({
                  driver_id: driver.user_id,
                  ...subscriptionPatch,
                });
            if (subscriptionWrite.error) throw subscriptionWrite.error;

            await admin.from("driver_payment_events").insert({
              driver_id: driver.id,
              provider: "mercadopago",
              event_type: "preference.renewal_created",
              mp_preapproval_id: preference.id,
              status: "pending",
              value: amount,
              invoice_url: initPoint,
              raw_payload: {
                source: "cron:renew-driver-subscriptions",
                preference_id: preference.id,
              },
            });

            // Notificação in-app (se a tabela existir)
            try {
              await admin.from("notification_inbox").insert({
                user_id: driver.user_id,
                title: "Renovação da mensalidade MOVVI",
                body: "Sua mensalidade está próxima do vencimento. Clique para pagar.",
                category: "billing",
                data: { init_point: initPoint, kind: "monthly_fee" },
              });
            } catch (nErr) {
              console.warn("[renew-cron] notification insert skipped", nErr);
            }

            results.push({ driverId: driver.id, ok: true });
          } catch (e) {
            const detail = String(e);
            console.error(`[renew-cron] driver ${driver.id} renewal failed`, detail);
            await admin.from("driver_payment_events").insert({
              driver_id: driver.id,
              provider: "mercadopago",
              event_type: "preference.renewal_failed",
              status: "error",
              raw_payload: { source: "cron:renew-driver-subscriptions", error: detail },
            });
            results.push({ driverId: driver.id, ok: false, error: detail.slice(0, 200) });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            renewed: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
            overdue_reconciliation_ok: !overdueRun.error,
            results,
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
