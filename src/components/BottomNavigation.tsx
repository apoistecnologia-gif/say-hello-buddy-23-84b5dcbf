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
    <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-lg border-t border-white/5 flex justify-around py-3 px-2 z-[100] safe-bottom pb-[calc(12px+env(safe-area-inset-bottom))]">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path as any}
            className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${
              isActive ? "text-apois-yellow" : "text-zinc-600"
            }`}
          >
            <item.icon size={22} strokeWidth={isActive ? 3 : 2} />
            <span className={cn(
              "text-[9px] font-black uppercase tracking-widest",
              isActive ? "text-apois-yellow" : "text-zinc-600"
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
