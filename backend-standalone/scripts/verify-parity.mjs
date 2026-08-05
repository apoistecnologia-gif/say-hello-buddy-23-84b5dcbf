#!/usr/bin/env node
// Compara o Supabase novo contra os requisitos dos APKs.
// Uso: node scripts/verify-parity.mjs
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const REQUIRED_TABLES = [
  "drivers",
  "users",
  "user_roles",
  "rides",
  "subscriptions",
  "cancellation_fees",
  "driver_documents",
  "driver_wallets",
  "driver_wallet_transactions",
  "driver_withdrawals",
  "passenger_wallets",
  "tariff_rules",
  "ride_categories",
  "driver_public_locations",
  "ride_ratings",
  "notifications",
  "notification_inbox",
  "user_notification_tokens",
  "favorite_places",
  "recent_places",
  "coupons",
  "support_tickets",
  "gps_diagnostics",
  "sos_alerts",
  "incident_reports",
];
const REQUIRED_RPCS = [
  "has_role",
  "get_driver_public_profile",
  "get_driver_public_stats",
  "get_driver_amenities_public",
  "get_passenger_public_profile",
  "get_ride_by_share_token",
  "request_driver_withdrawal",
  "activate_due_scheduled_rides",
  "settle_cancellation_fee",
];
const REQUIRED_BUCKETS = [
  "driver-selfies",
  "driver-cnh",
  "vehicle-documents",
  "profile-photos",
  "ride-attachments",
  "downloads",
];
const REQUIRED_EDGE_FUNCTIONS = [
  "approve-driver-and-create-mercadopago-subscription",
  "create-my-mercadopago-subscription",
  "create-cancellation-fee-charge",
  "regenerate-driver-mercadopago-charge",
  "mercadopago-webhook",
  "dispatch-broadcast-test",
  "request-driver-payout",
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log("Verificando", url);

  // Tables
  console.log("\n== Tabelas ==");
  for (const t of REQUIRED_TABLES) {
    const { error } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(error ? `  [FALTA]  ${t} (${error.message})` : `  [OK]    ${t}`);
  }

  // RPCs
  console.log("\n== RPCs ==");
  for (const r of REQUIRED_RPCS) {
    const { error } = await sb.rpc(r, {});
    const missing = error && /does not exist|not found/i.test(error.message);
    console.log(missing ? `  [FALTA]  ${r}` : `  [OK]    ${r}`);
  }

  // Buckets
  console.log("\n== Buckets ==");
  const { data: buckets } = await sb.storage.listBuckets();
  const found = new Set((buckets ?? []).map((b) => b.name));
  for (const b of REQUIRED_BUCKETS) {
    console.log(found.has(b) ? `  [OK]    ${b}` : `  [FALTA]  ${b}`);
  }

  console.log("\n== Edge Functions ==");
  console.log("(Verifique via CLI: supabase functions list --project-ref zjphbuvcapwyuynadgdt)");
  for (const f of REQUIRED_EDGE_FUNCTIONS) console.log(`  esperado: ${f}`);

  console.log("\nOK.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
