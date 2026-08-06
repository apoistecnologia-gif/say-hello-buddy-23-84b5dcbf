import { Home, History, CreditCard, Bell, User } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const BottomNavigation = () => {
  const location = useLocation();

  const navItems = [
    { label: "Início", icon: Home, path: "/inicio" },
    { label: "Corridas", icon: History, path: "/corridas" },
    { label: "Carteira", icon: CreditCard, path: "/carteira" },
    { label: "Notificações", icon: Bell, path: "/notificacoes" },
    { label: "Perfil", icon: User, path: "/perfil" },
  ];

  return (
    <nav className="relative w-full bg-black border-t border-white/10 flex justify-around py-3 px-2 z-[100] pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.5)] shrink-0">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${
              isActive ? "text-apois-yellow" : "text-zinc-600"
            }`}
          >
            <item.icon size={22} strokeWidth={isActive ? 3 : 2} />
            <span
              className={cn(
                "text-[9px] font-black uppercase tracking-widest",
                isActive ? "text-apois-yellow" : "text-zinc-600",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
