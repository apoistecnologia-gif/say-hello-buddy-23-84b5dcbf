import React from "react";
import { useLocation } from "@/hooks/use-location";
import { Button } from "@/components/ui/button";
import { MapPin, ShieldAlert, RefreshCw, Settings } from "lucide-react";

export const LocationStatus: React.FC = () => {
  const { 
    location, 
    isLoading, 
    error, 
    permissionState, 
    requestPermission, 
    refreshLocation, 
    openSettings
  } = useLocation();

  if (permissionState === "prompt") {
    return (
      <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl flex flex-col gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <MapPin className="text-apois-yellow shrink-0" size={20} />
          <p className="text-xs font-medium text-zinc-300">Precisamos da sua localização para encontrar motoristas e calcular trajetos.</p>
        </div>
        <Button 
          onClick={requestPermission} 
          disabled={isLoading}
          className="h-10 rounded-xl bg-apois-yellow text-black font-black text-[10px] uppercase tracking-widest"
        >
          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : "Permitir localização"}
        </Button>
      </div>
    );
  }

  if (permissionState === "denied") {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-red-500 shrink-0" size={20} />
          <p className="text-xs font-medium text-red-200">A permissão de localização foi negada. O app não consegue funcionar sem GPS.</p>
        </div>
        <Button 
          onClick={requestPermission} 
          variant="destructive"
          className="h-10 rounded-xl font-black text-[10px] uppercase tracking-widest"
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (permissionState === "blocked") {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-red-500 shrink-0" size={20} />
          <p className="text-xs font-medium text-red-200">A localização está bloqueada nas configurações do aparelho.</p>
        </div>
        <Button 
          onClick={openSettings} 
          className="h-10 rounded-xl bg-zinc-800 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
        >
          <Settings size={14} />
          Abrir configurações
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-zinc-900 border border-white/5 rounded-2xl flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="text-yellow-500 shrink-0" size={18} />
          <p className="text-[10px] font-medium text-zinc-400 max-w-[200px] leading-tight">{error}</p>
        </div>
        <Button 
          onClick={refreshLocation} 
          variant="ghost" 
          size="icon" 
          className="h-10 w-10 text-apois-yellow hover:bg-white/5"
        >
          <RefreshCw size={18} />
        </Button>
      </div>
    );
  }

  return null;
};
