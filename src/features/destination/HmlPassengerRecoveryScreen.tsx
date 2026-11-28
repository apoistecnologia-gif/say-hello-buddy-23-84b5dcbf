import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { HML_ORIGIN, uuid } from "@/lib/hml-mobile-transport";
import { createHmlPassengerInvoke } from "@/lib/hml-passenger-invoke";
import { mountDurablePassengerHost } from "@/lib/hml-navigation/durable-passenger-view.mjs";

/** Recovery-only HML entry point. No map pack is approved yet; never substitute Google. */
export function HmlPassengerRecoveryScreen() {
  const { user, signOut } = useAuth();
  const account = user?.id;
  const root = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "mounted" | "error">("loading");
  const [tracking, setTracking] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node || !uuid(account)) { setState("error"); return; }
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    setState("loading");
    setTracking(false);
    const invoke = createHmlPassengerInvoke({
      origin: HML_ORIGIN, account,
      session: async () => {
        const { data, error } = await supabase.auth.getSession();
        return error ? null : data.session;
      },
    });
    // Deny create even if a view regression attempts to submit it.
    const recoveryInvoke: typeof invoke = (target, options) => {
      if (target !== "apois-navigation-control") return Promise.reject(new Error("New requests disabled"));
      return invoke(target, options);
    };
    void mountDurablePassengerHost(node, {
      enabled: true, account, auth: supabase.auth, invoke: recoveryInvoke,
      allowSelection: false, allowCreate: false, allowReturn: false,
      onReturn: () => {},
      onTrack: () => { if (!controller.signal.aborted) setTracking(true); },
      signal: controller.signal,
    }).then(host => {
      if (controller.signal.aborted) { host?.dispose(); return; }
      if (!host) { setState("error"); return; }
      dispose = host.dispose;
      setState("mounted");
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => { controller.abort(); dispose?.(); node.replaceChildren(); };
  }, [account, attempt]);
  return (
    <main className="app-viewport app-safe-top app-safe-bottom app-safe-x min-h-[100dvh] overflow-y-auto bg-apois-black text-white">
      <section className="app-surface mx-auto mt-5 max-w-lg space-y-4 rounded-3xl p-5">
        <h1 className="text-xl font-black">APOIS Corridas • Homologação</h1>
        <p className="text-sm text-zinc-400">Consulta e recuperação seguras. Novas corridas permanecem bloqueadas até a aprovação dos mapas.</p>
        {state === "loading" && <p role="status">Verificando sessão e corrida ativa…</p>}
        {state === "error" && <p role="alert">Não foi possível abrir a recuperação segura. Nenhuma nova corrida será criada.</p>}
        <div ref={root} className="[&_section]:space-y-3 [&_h2]:text-lg [&_h2]:font-bold [&_p]:text-sm [&_button]:my-1 [&_button]:min-h-12 [&_button]:w-full [&_button]:rounded-2xl [&_button]:border [&_button]:border-white/10 [&_button]:bg-white/5 [&_button]:px-4 [&_button]:font-semibold [&_button:disabled]:opacity-50" />
        {tracking && <p role="status" className="text-sm text-zinc-400">Corrida existente confirmada. O acompanhamento em mapa ainda não está habilitado nesta versão de teste.</p>}
        <button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-12 w-full rounded-2xl border border-white/10 px-4 font-semibold">Atualizar recuperação</button>
        <button type="button" onClick={() => void signOut()} className="min-h-12 w-full rounded-2xl border border-white/10 px-4 font-semibold">Sair da conta</button>
      </section>
    </main>
  );
}
