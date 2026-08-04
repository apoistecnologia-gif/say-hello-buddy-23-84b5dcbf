import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  User as UserIcon,
  Phone,
  Mail,
  ChevronRight,
  Bell,
  Shield,
  CreditCard,
  Star,
  CheckCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const currentProfile = profile || {
    name: "Passageiro",
    avatar_url: "",
    phone: "",
    average_rating: 5.0,
    completed_rides: 0
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white pb-24">
      <div className="p-6 pt-12 flex flex-col items-center border-b border-gray-900">
        <Avatar className="w-24 h-24 mb-4 border-2 border-yellow-500 p-1">
          <AvatarImage src={currentProfile.avatar_url} />
          <AvatarFallback className="bg-gray-800 text-yellow-500 text-3xl font-bold">
            {currentProfile.name.charAt(0) || user?.email?.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-bold">{currentProfile.name}</h2>
        <p className="text-gray-400 text-sm">{user?.email}</p>

        {currentProfile.average_rating !== null && (
          <div className="flex items-center gap-4 mt-4 bg-[#121212] px-4 py-2 rounded-full">
            <div className="flex items-center gap-1 text-yellow-500">
              <Star size={16} fill="currentColor" />
              <span className="text-sm font-bold text-white">{currentProfile.average_rating}</span>
            </div>
            <div className="w-px h-4 bg-gray-800" />
            <div className="flex items-center gap-1 text-green-500">
              <CheckCircle size={16} />
              <span className="text-sm font-bold text-white">
                {currentProfile.completed_rides} corridas
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          <p className="text-xs font-bold text-gray-500 px-2 pt-4 pb-2 uppercase tracking-wider">
            Conta
          </p>

          <div className="space-y-1">
            <MenuLink icon={<UserIcon size={20} />} label="Dados Pessoais" value={currentProfile.name} />
            <MenuLink icon={<Phone size={20} />} label="Telefone" value={currentProfile.phone} />
            <MenuLink icon={<Mail size={20} />} label="E-mail" value={user?.email} />
          </div>

          <p className="text-xs font-bold text-gray-500 px-2 pt-6 pb-2 uppercase tracking-wider">
            Preferências
          </p>

          <div className="space-y-1">
            <MenuLink icon={<Bell size={20} />} label="Notificações" />
            <MenuLink icon={<CreditCard size={20} />} label="Pagamentos" />
            <MenuLink icon={<Shield size={20} />} label="Segurança" />
          </div>
        </div>

        <div className="p-6 mt-4">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full border-red-900/50 text-red-500 bg-red-500/5 hover:bg-red-500/10 hover:text-red-400 h-14 rounded-xl flex items-center justify-center gap-2"
          >
            <LogOut size={20} />
            Sair do aplicativo
          </Button>

          <p className="text-center text-gray-600 text-xs mt-8">Versão 1.0.0 (Oficial)</p>
        </div>
      </div>
    </div>
  );
}

function MenuLink({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null | undefined;
}) {
  return (
    <button className="w-full flex items-center justify-between p-4 bg-[#121212] hover:bg-[#1a1a1a] rounded-xl transition-colors text-left group">
      <div className="flex items-center gap-4">
        <div className="text-yellow-500">{icon}</div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {value && <p className="text-xs text-gray-500 truncate max-w-[200px]">{value}</p>}
        </div>
      </div>
      <ChevronRight
        size={18}
        className="text-gray-700 group-hover:text-yellow-500 transition-colors"
      />
    </button>
  );
}
