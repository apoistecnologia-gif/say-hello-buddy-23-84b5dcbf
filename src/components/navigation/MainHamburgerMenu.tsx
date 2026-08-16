import { Bell, CreditCard, FileText, History, Home, Menu, ShieldCheck, User, X } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Início", description: "Mapa e nova corrida", icon: Home, path: "/inicio" },
  { label: "Corridas", description: "Histórico e detalhes", icon: History, path: "/corridas" },
  { label: "Carteira", description: "Saldo e pendências", icon: CreditCard, path: "/carteira" },
  { label: "Avisos", description: "Notificações da APOIS", icon: Bell, path: "/notificacoes" },
  { label: "Perfil", description: "Conta, segurança e suporte", icon: User, path: "/perfil" },
  { label: "Termos de Uso", description: "Regras vigentes do APOIS", icon: FileText, path: "/termos" },
  {
    label: "Política de Privacidade",
    description: "Tratamento e proteção dos seus dados",
    icon: ShieldCheck,
    path: "/privacidade",
  },
] as const;

const journeyRoutes = ["/buscar-destino", "/revisar-solicitacao"];

export function MainHamburgerMenu() {
  const location = useLocation();
  const pathname = location.pathname;
  const [open, setOpen] = useState(false);

  const isNestedRideDetails = pathname.startsWith("/corridas/");
  const isJourney =
    pathname === "/inicio" ||
    journeyRoutes.includes(pathname) ||
    pathname.startsWith("/corrida/") ||
    isNestedRideDetails;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (isJourney) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu principal"
        aria-expanded={open}
        className="app-main-menu-trigger app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-xl"
      >
        <Menu size={22} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[180] flex justify-end" role="dialog" aria-modal="true" aria-label="Menu principal">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
          />

          <aside className="app-main-menu-drawer app-safe-top app-safe-bottom relative z-10 flex h-[100dvh] w-[min(88vw,360px)] flex-col border-l border-white/10 bg-[#0b0c0f] shadow-[-24px_0_70px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-apois-yellow">APOIS Passageiro</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white">Menu</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu principal"
                className="app-pressable flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="app-scroll flex-1 space-y-2 px-4 pt-4" aria-label="Navegação principal">
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "app-pressable flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3",
                      active
                        ? "border-apois-yellow/25 bg-apois-yellow/10 text-white"
                        : "border-white/7 bg-white/[0.025] text-zinc-300",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        active ? "bg-apois-yellow text-black" : "bg-white/5 text-zinc-400",
                      )}
                    >
                      <Icon size={20} strokeWidth={active ? 2.7 : 2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">{item.description}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
