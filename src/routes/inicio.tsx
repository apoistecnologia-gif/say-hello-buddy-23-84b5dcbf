import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { LocationStatus } from "@/components/location/LocationStatus";
import PassengerMap from "@/components/map/PassengerMap";
import { MapPin, Shield, AlertCircle, Loader2, X } from "lucide-react";

export const Route = createFileRoute("/inicio")({
  component: InicioPage,
});

function InicioPage() {
  const navigate = useNavigate();
  const { accuracyQuality } = useLocation();
  const { address, status, isLoading, error, refreshAddress } = usePickupAddress();
  const { destination, clearDestination, hasDestination } = useDestination();

  const handleOpenSearch = () => {
    navigate({ to: '/buscar-destino' });
  };

  const handleClearDestination = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearDestination();
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white relative">
      {/* Map Background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <PassengerMap />
      </div>

      {/* Top Overlay Controls */}
      <div className="relative z-10 p-4 pt-6">
        <div className="bg-[#1e1e1e]/90 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/5">
          <LocationStatus />
          
          {/* Pickup Address Display */}
          <div className="mt-2 mb-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Seu local de embarque</p>
            
            {isLoading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
              </div>
            ) : error ? (
              <button 
                onClick={() => refreshAddress()}
                className="flex items-center gap-2 py-2 text-red-400 group active:scale-[0.98]"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{error.message} (Toque para tentar)</span>
              </button>
            ) : address ? (
              <div className="py-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white leading-tight truncate">
                    {address.label}
                  </h2>
                  {address.isApproximate && (
                    <div className="bg-yellow-500/10 px-1.5 py-0.5 rounded border border-yellow-500/20">
                      <span className="text-[8px] font-black text-yellow-500 uppercase">Aprox.</span>
                    </div>
                  )}
                </div>
                {address.subLabel && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{address.subLabel}</p>
                )}
              </div>
            ) : (
              <div className="py-2">
                <p className="text-sm text-gray-500 italic">Identificando endereço...</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full ${accuracyQuality !== 'none' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-gray-400">
              {accuracyQuality !== 'none' ? 'GPS Ativo e Preciso' : 'Aguardando sinal de GPS...'}
            </span>
          </div>

          <button 
            onClick={handleOpenSearch}
            className="w-full bg-[#2a2a2a] text-left px-4 py-4 rounded-xl font-bold text-lg border border-gray-700/50 shadow-inner flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <MapPin className={`w-5 h-5 ${hasDestination ? 'text-blue-500' : 'text-yellow-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              {hasDestination ? (
                <div>
                  <p className="text-white text-base truncate leading-tight">{destination?.label}</p>
                  <p className="text-gray-400 text-[10px] font-medium truncate mt-0.5">{destination?.subLabel}</p>
                </div>
              ) : (
                <span className="text-zinc-200">Para onde vamos?</span>
              )}
            </div>
            {hasDestination && (
              <button 
                onClick={handleClearDestination}
                className="p-2 -mr-1 text-gray-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Floating Area */}
      <div className="mt-auto relative z-10 p-4 pb-24">
        {/* Floating SOS button */}
        <div className="flex justify-end mb-4">
          <button className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-black/20 active:scale-90 transition-transform">
            <Shield className="w-7 h-7 text-white" />
          </button>
        </div>

        {/* Categories / Quick Actions Panel */}
        <div className="bg-[#1e1e1e]/95 backdrop-blur-lg rounded-3xl p-5 border border-white/5 shadow-2xl">
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Comum", active: true },
              { label: "Premium", active: false },
              { label: "Entrega", active: false },
              { label: "Mercado", active: false }
            ].map((cat) => (
              <button 
                key={cat.label} 
                className="flex flex-col items-center gap-2 group opacity-50 grayscale pointer-events-none"
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                  cat.active 
                    ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_15px_rgba(255,184,0,0.3)]' 
                    : 'bg-[#2a2a2a] border-gray-800'
                }`}>
                  <div className={`w-8 h-4 rounded-sm ${cat.active ? 'bg-black' : 'bg-yellow-500/50'}`} />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${cat.active ? 'text-yellow-500' : 'text-gray-500'}`}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button className="bg-[#2a2a2a] py-4 rounded-2xl font-bold text-gray-400 border border-gray-700/50 opacity-60 cursor-not-allowed">
              Agendar
            </button>
            <button className="bg-yellow-500 text-black py-4 rounded-2xl font-black shadow-lg shadow-yellow-500/20 active:scale-95 transition-all">
              Segurança
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
