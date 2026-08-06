import { Bell, CreditCard, History, Home, User } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Início", icon: Home, path: "/inicio" },
  { label: "Corridas", icon: History, path: "/corridas" },
  { label: "Carteira", icon: CreditCard, path: "/carteira" },
  { label: "Avisos", icon: Bell, path: "/notificacoes" },
  { label: "Perfil", icon: User, path: "/perfil" },
] as const;

const journeyRoutesWithoutNavigation = ["/buscar-destino", "/revisar-solicitacao"];

export const BottomNavigation = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const isJourneyScreen = journeyRoutesWithoutNavigation.includes(pathname) || pathname.startsWith("/corrida/");

  if (isJourneyScreen) return null;

  return (
    <nav
      aria-label="Navegação principal"
      className="relative z-[100] grid min-h-[var(--app-nav-height)] w-full shrink-0 grid-cols-5 border-t border-white/8 bg-black/95 px-safe-area-inset pb-safe-area-inset-bottom shadow-[0_-12px_30px_rgba(0,0,0,0.42)] backdrop-blur-xl"
    >
      {navItems.map((item) => {
        const isActive = pathname === item.path;
        const Icon = item.icon;

        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "app-pressable relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 text-zinc-600",
              isActive && "text-apois-yellow",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0 h-1 w-7 rounded-b-full bg-transparent transition-colors",
                isActive && "bg-apois-yellow",
              )}
            />
            <span
              className={cn(
                "flex h-8 w-11 items-center justify-center rounded-2xl transition-colors",
                isActive && "bg-apois-yellow/12",
              )}
            >
              <Icon size={21} strokeWidth={isActive ? 2.8 : 2} />
            </span>
            <span className={cn("text-[9px] font-bold tracking-tight", isActive && "font-black")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
