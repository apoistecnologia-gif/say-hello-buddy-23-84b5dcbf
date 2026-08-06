#!/usr/bin/env node
/**
 * Diagnóstico de prontidão de push do APOIS Passageiro.
 * Mostra APENAS presença/ausência de configuração — nunca valores secretos.
 *
 * Uso: node scripts/push-readiness.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (p) => {
  try {
    return readFileSync(resolve(root, p), "utf8");
  } catch {
    return "";
  }
};

const checks = [];
const add = (label, ok, hint = "") => checks.push({ label, ok, hint });

// --- Android nativo -------------------------------------------------------
const manifest = read("android/app/src/main/AndroidManifest.xml");
const appGradle = read("android/app/build.gradle");
const rootGradle = read("android/build.gradle");
const variables = read("android/variables.gradle");
const capConfig = read("capacitor.config.ts");
const plugins = read("android/app/src/main/assets/capacitor.plugins.json");

add(
  "android/app/google-services.json presente",
  existsSync(resolve(root, "android/app/google-services.json")),
  "Baixe do console Firebase (app Android com.apois.passageiro) — veja docs/FIREBASE_PUSH_SETUP.md",
);
add("Classpath com.google.gms:google-services no Gradle raiz", rootGradle.includes("com.google.gms:google-services"));
add("Plugin google-services aplicado no app (condicional)", appGradle.includes("com.google.gms.google-services"));
add("firebaseMessagingVersion fixado em variables.gradle", variables.includes("firebaseMessagingVersion"));
add("applicationId = com.apois.passageiro", appGradle.includes('applicationId "com.apois.passageiro"'));
add("namespace = com.apois.passageiro", appGradle.includes('namespace = "com.apois.passageiro"'));
add("MainActivity no pacote com.apois.passageiro", existsSync(resolve(root, "android/app/src/main/java/com/apois/passageiro/MainActivity.java")));
add("Permissão INTERNET", manifest.includes("android.permission.INTERNET"));
add("Permissão POST_NOTIFICATIONS", manifest.includes("android.permission.POST_NOTIFICATIONS"));
add("Canal padrão FCM declarado no Manifest", manifest.includes("default_notification_channel_id"));
add("Plugin @capacitor/push-notifications sincronizado", plugins.includes("@capacitor/push-notifications"));
add("appId do Capacitor = com.apois.passageiro", capConfig.includes('appId: "com.apois.passageiro"'));

// --- Cliente web ----------------------------------------------------------
const service = read("src/services/push/push-service.ts");
add("Serviço de push criado", service.length > 0);
add("Canal apois_rides criado no cliente", service.includes("apois_rides"));
add("RPC register_notification_token usada", service.includes("register_notification_token"));
add("RPC deactivate_notification_token usada", service.includes("deactivate_notification_token"));

// --- Backend --------------------------------------------------------------
const fn = read("supabase/functions/send-ride-push/index.ts");
add("Edge Function send-ride-push presente", fn.length > 0);
add("Endpoint FCM HTTP v1", fn.includes("fcm.googleapis.com/v1/projects/"));
add("Segredo FIREBASE_SERVICE_ACCOUNT_B64 lido do ambiente", fn.includes("FIREBASE_SERVICE_ACCOUNT_B64"));
add("channel_id apois_rides no payload FCM", fn.includes('channel_id: "apois_rides"'));
add("Diagnóstico seguro (diagnostics.readiness)", fn.includes("diagnostics.readiness"));

const pending = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? "OK  " : "FALTA"}  ${c.label}${c.ok || !c.hint ? "" : `\n        → ${c.hint}`}`);
console.log(`\n${checks.length - pending.length}/${checks.length} verificações OK.`);
if (pending.length) {
  console.log("Pendências (nenhum valor secreto é exibido por este script):");
  for (const c of pending) console.log(` - ${c.label}`);
}
