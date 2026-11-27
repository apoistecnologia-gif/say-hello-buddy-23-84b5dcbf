// HML mobile transport. No production fallback, token logging or automatic retry.
export const HML_ORIGIN = "https://apois-mobile-hml-apoistecnologia-dev.apps.rm3.7wse.p1.openshiftapps.com";
const paths = {
  driver: "/functions/v1/apois-hml-driver-dispatch",
  pin: "/functions/v1/apois-hml-passenger-pin",
  navigation: "/functions/v1/apois-hml-navigation-generation",
} as const;
type Endpoint = keyof typeof paths;
type Json = Record<string, unknown>;
type Session = { access_token: string; user: { id: string } };
type Result = { status: number; body: Json };
export const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const record = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
export const exact = (v: unknown, keys: string[]): v is Json =>
  record(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v,k));
export function createHmlMobileTransport({
  origin, session, send = fetch, timeoutMs = 9000,
}: { origin: string; session: () => Promise<Session | null>; send?: typeof fetch; timeoutMs?: number }) {
  if (origin !== HML_ORIGIN || !Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 10000) throw new Error("invalid_hml_transport");
  return async (endpoint: Endpoint, body: Json, signal?: AbortSignal): Promise<Result> => {
    const path = paths[endpoint];
    if (!path || !record(body)) throw new Error("invalid_hml_request");
    const serialized = JSON.stringify(body);
    const size = new TextEncoder().encode(serialized).length;
    if (size > ({driver:2048,pin:256,navigation:512}[endpoint])) throw new Error("invalid_hml_request");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(cancel, timeoutMs);
    const ensure = () => { if(controller.signal.aborted) throw new Error("hml_outcome_unknown"); };
    const work = async (): Promise<Result> => {
      ensure();
      const before = await session();
      ensure();
      if (!before || !uuid(before.user.id) || typeof before.access_token !== "string" ||
          before.access_token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(before.access_token))
        throw new Error("hml_session_required");
      let response: Response;
      try {
        response = await send(HML_ORIGIN + path, {
          method: "POST", body: serialized, headers: { Authorization: "Bearer " + before.access_token, "Content-Type": "application/json" },
          credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
        });
      } catch { throw new Error("hml_outcome_unknown"); }
      ensure();
      if (response.redirected || (response.url && response.url !== HML_ORIGIN + path) ||
          !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body)
        throw new Error("hml_outcome_unknown");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      try {
        for (;;) {
          const {done,value} = await reader.read(); ensure();
          if(done) break;
          total += value.byteLength;
          if(total > 16384) { void reader.cancel().catch(()=>{}); throw new Error("hml_outcome_unknown"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(total); let offset = 0;
      for(const chunk of chunks){ bytes.set(chunk,offset); offset+=chunk.byteLength; }
      let data: unknown;
      try { data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); } catch { throw new Error("hml_outcome_unknown"); }
      if (!record(data)) throw new Error("hml_outcome_unknown");
      const after = await session(); ensure();
      if (!after || after.user.id !== before.user.id || after.access_token !== before.access_token)
        throw new Error("hml_session_changed");
      return {status:response.status,body:data};
    };
    let rejectOnAbort: (()=>void) | undefined;
    try {
      const stopped=new Promise<never>((_,reject)=>{
        rejectOnAbort=()=>reject(new Error("hml_outcome_unknown"));
        controller.signal.addEventListener("abort",rejectOnAbort,{once:true});
        if(controller.signal.aborted)rejectOnAbort();
      });
      return await Promise.race([work(),stopped]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort",cancel);
      if(rejectOnAbort)controller.signal.removeEventListener("abort",rejectOnAbort);
    }
  };
}
