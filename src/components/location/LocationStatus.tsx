import React from "react";
import { useLocation } from "@/hooks/use-location";
import { Button } from "@/components/ui/button";
import { MapPin, ShieldAlert, RefreshCw } from "lucide-react";

export const LocationStatus: React.FC = () => {
  const { location, isLoading, error, permissionState, requestPermission, refreshPosition } = useLocation();

  if (permissionState === "denied") {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-red-500 shrink-0" size={20} />
          <p className="text-xs font-medium text-red-200">Permissão de localização negada. O app precisa do GPS para funcionar.</p>
        </div>
        <Button onClick={requestPermission} size="sm" variant="destructive" className="h-8 rounded-lg text-[10px] uppercase font-bold">
          Dar Permissão
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl flex justify-between items-center">
        <p className="text-xs text-zinc-500">Erro: {typeof error === 'string' ? error : 'GPS indisponível'}</p>
        <Button onClick={refreshPosition} variant="ghost" size="icon" className="h-8 w-8 text-yellow-500">
          <RefreshCw size={16} />
        </Button>
      </div>
    );
  }

  return null;
};
