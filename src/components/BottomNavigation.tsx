import { Bell, CreditCard, History, Home, Menu, User, X } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Início", description: "Mapa e nova corrida", icon: Home, path: "/inicio" },
  { label: "Corridas", description: "Histórico e viagens", icon: History, path: "/corridas" },
  { label: "Carteira", description: "Saldo, multas e pagamentos", icon: CreditCard, path: "/carteira" },
  { label: "Avisos", description: "Notificações da sua conta", icon: Bell, path: "/notificacoes" },
  { label: "Perfil", description: "Conta, segurança e suporte", icon: User, path: "/perfil" },
] as const;

const journeyRoutesWithoutNavigation = ["/buscar-destino", "/revisar-solicitacao"];

export const BottomNavigation = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const [isOpen, setIsOpen] = useState(false);
  const isJourneyScreen =
    journeyRoutesWithoutNavigation.includes(pathname) || pathname.startsWith("/corrida/");

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (isJourneyScreen) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir menu principal"
        aria-expanded={isOpen}
        className="app-main-menu-trigger app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/80 text-white shadow-2xl backdrop-blur-xl"
      >
        <Menu size={22} strokeWidth={2.5} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[200]">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <aside
            aria-label="Menu principal"
            className="app-main-menu-drawer app-safe-top app-safe-bottom absolute inset-y-0 right-0 flex w-[86vw] max-w-[360px] flex-col border-l border-white/10 bg-[#0b0c0f] px-4 shadow-[-24px_0_70px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between px-2 pb-5 pt-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-apois-yellow">
                  APOIS Passageiro
                </p>
                <p className="mt-1 text-xl font-black tracking-[-0.04em] text-white">Menu</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fechar menu principal"
                className="app-pressable flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white"
              >
                <X size={21} />
              </button>
            </div>

            <nav aria-label="Navegação principal" className="app-scroll flex-1 space-y-2 px-1 pb-6">
              {navItems.map((item) => {
                const isActive = pathname === item.path;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "app-pressable flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-3",
                      isActive
                        ? "border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow"
                        : "border-white/7 bg-white/[0.035] text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        isActive ? "bg-apois-yellow text-black" : "bg-white/6 text-zinc-400",
                      )}
                    >
                      <Icon size={20} strokeWidth={isActive ? 2.8 : 2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">
                        {item.description}
                      </span>
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
};