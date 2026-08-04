import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function hasCurrentDriverSubscription(
  driverUserId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("driver_id", driverUserId)
    .eq("status", "active")
    .not("paid_at", "is", null)
    .or(`period_start.is.null,period_start.lte.${now.toISOString()}`)
    .gt("period_end", now.toISOString())
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Falha ao validar a mensalidade: ${result.error.message}`);
  }
  return Boolean(result.data);
}

export async function currentDriverSubscriptionIds(
  driverUserIds: string[],
  now = new Date(),
): Promise<Set<string>> {
  if (!driverUserIds.length) return new Set();
  const result = await supabaseAdmin
    .from("subscriptions")
    .select("driver_id")
    .in("driver_id", driverUserIds)
    .eq("status", "active")
    .not("paid_at", "is", null)
    .or(`period_start.is.null,period_start.lte.${now.toISOString()}`)
    .gt("period_end", now.toISOString());

  if (result.error) {
    throw new Error(`Falha ao validar mensalidades do despacho: ${result.error.message}`);
  }
  return new Set((result.data ?? []).map((row) => String(row.driver_id ?? "")).filter(Boolean));
}
