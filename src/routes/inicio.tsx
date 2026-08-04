import { createFileRoute } from "@tanstack/react-router";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { LocationStatus } from "@/components/location/LocationStatus";
import PassengerMap from "@/components/map/PassengerMap";
import { MapPin, Shield, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/inicio")({
  component: InicioPage,
});

function InicioPage() {
  const { accuracyQuality } = useLocation();

  return (
    <div className="flex flex-col min-h-screen bg-black text-white relative">
      {/* Map Background - Occupies full background to allow overlaying elements */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <PassengerMap />
      </div>

      {/* Top Overlay Controls */}
      <div className="relative z-10 p-4 pt-6">
        <div className="bg-[#1e1e1e]/90 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/5">
          <LocationStatus />
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full ${accuracyQuality !== 'none' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-gray-400">
              {accuracyQuality !== 'none' ? 'GPS Ativo e Preciso' : 'Aguardando sinal de GPS...'}
            </span>
          </div>
          <button className="w-full bg-[#2a2a2a] text-left px-4 py-4 rounded-xl font-bold text-lg border border-gray-700/50 shadow-inner flex items-center gap-3 active:scale-[0.98] transition-all">
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-yellow-500" />
            </div>
            <span className="text-zinc-200">Para onde vamos?</span>
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
