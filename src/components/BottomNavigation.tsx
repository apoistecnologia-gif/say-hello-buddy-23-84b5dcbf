import { Home, History, CreditCard, Bell, User } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";

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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-gray-800 flex justify-around py-3 px-2 z-50 pb-safe-area-inset-bottom">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive ? "text-yellow-500" : "text-gray-500"
            }`}
          >
            <item.icon size={24} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
