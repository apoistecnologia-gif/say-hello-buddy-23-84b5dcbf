// Server-side Supabase publishable client for this backend. Not shipped to browsers.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}
function shim(key: string): typeof fetch {
  return (input, init) => {
    const h = new Headers(init?.headers ?? {});
    if (isNewSupabaseApiKey(key) && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
    h.set("apikey", key);
    return fetch(input, { ...init, headers: h });
  };
}
function make() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(url, key, {
    global: { fetch: shim(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
let _c: ReturnType<typeof make> | undefined;
export const supabase = new Proxy({} as ReturnType<typeof make>, {
  get(_, p, r) { if (!_c) _c = make(); return Reflect.get(_c, p, r); }
});
