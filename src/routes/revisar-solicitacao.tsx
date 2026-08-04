import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useWallet } from "@/hooks/use-wallet";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { 
  ChevronLeft, 
  MapPin, 
  Navigation, 
  CreditCard, 
  AlertTriangle, 
  Loader2, 
  ChevronRight,
  ShieldAlert,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/revisar-solicitacao")({
  component: RideRequestReviewPage,
});

function RideRequestReviewPage() {
  const navigate = useNavigate();
  const { confirmRide, request } = useRideRequest();
  const { error, isSubmitting } = request;
  const { address: pickupAddress } = usePickupAddress();
  const { destination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { selectedMethod } = usePaymentMethods();
  const { state: walletState, wallet } = useWallet();
  const { orderedStops } = useRideStops();

  const handleBack = () => navigate({ to: "/inicio" });

  const getPaymentLabel = (method: string | null) => {
    const labels: Record<string, string> = {
      pix: "PIX",
      credit_card: "Cartão de Crédito",
      debit_card: "Cartão de Débito",
      cash: "Dinheiro",
      wallet: "Carteira APOIS",
      corporate: "Corporativo"
    };
    return method ? labels[method] || method : "Não selecionado";
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white pb-safe">
      <div className="px-5 py-6 flex items-center gap-4 border-b border-white/5 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={handleBack} className="p-2 -ml-2 text-zinc-400">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-black">Revisar Solicitação</h1>
      </div>

      <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex flex-col items-center py-1">
              <div className="w-2.5 h-2.5 rounded-full bg-apois-yellow shadow-[0_0_8px_rgba(255,184,0,0.4)]" />
              <div className="w-px flex-1 bg-zinc-800 my-1" />
              {orderedStops.map((stop) => (
                <React.Fragment key={stop.id}>
                  <div className="w-2.5 h-2.5 rounded-full border border-zinc-600 bg-zinc-900" />
                  <div className="w-px flex-1 bg-zinc-800 my-1" />
                </React.Fragment>
              ))}
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
            </div>
            <div className="flex-1 space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Origem</p>
                <p className="text-sm font-bold line-clamp-1">{pickupAddress || "Carregando..."}</p>
              </div>
              
              {orderedStops.map((stop, i) => (
                <div key={stop.id}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Parada {i + 1}</p>
                  <p className="text-sm font-bold line-clamp-1">{stop.label}</p>
                </div>
              ))}

              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Destino</p>
                <p className="text-sm font-bold line-clamp-1">{destination?.formattedAddress || destination?.label}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Categoria</p>
            <p className="text-base font-bold text-apois-yellow">{selectedCategory?.label}</p>
          </div>
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Pagamento</p>
            <p className="text-base font-bold">{getPaymentLabel(selectedMethod)}</p>
          </div>
        </div>

        {selectedCategory?.details && Object.keys(selectedCategory.details).length > 0 && (
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5">
             <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Detalhes do Serviço</p>
             <div className="grid grid-cols-2 gap-y-3 gap-x-2">
                {Object.entries(selectedCategory.details).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-[9px] text-zinc-500 uppercase">{key.replace(/([A-Z])/g, ' ')}</p>
                    <p className="text-xs font-bold capitalize">{String(value)}</p>
                  </div>
                ))}
             </div>
          </div>
        )}

        <div className="bg-zinc-900/50 rounded-2xl p-5 border border-white/5 space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Estimativa Total</p>
              <p className="text-3xl font-black text-white">{formatCurrency(checkout.finalTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium text-zinc-500">
                {route ? `${(route.distanceMeters / 1000).toFixed(1)} km • ${Math.round(route.durationSeconds / 60)} min` : '--'}
              </p>
            </div>
          </div>
          
          <div className="bg-zinc-800/50 rounded-xl p-3 flex gap-3 items-start border border-white/5">
            <Info className="text-zinc-500 shrink-0 mt-0.5" size={16} />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              O valor exibido é uma estimativa baseada na rota atual. 
              <span className="text-zinc-300 font-bold"> O valor oficial será confirmado pelo servidor ao solicitar.</span>
            </p>
          </div>
        </div>

        {walletState === "blocked" && (
          <div className="bg-red-500/10 rounded-2xl p-5 border border-red-500/20 flex gap-4 items-start animate-in fade-in slide-in-from-top duration-300">
            <ShieldAlert className="text-red-500 shrink-0" size={24} />
            <div>
              <h3 className="text-sm font-black text-red-500 uppercase tracking-tight">Carteira Bloqueada</h3>
              <p className="text-xs text-red-400/80 mt-1">
                {wallet?.blocked_reason || "Existe uma pendência na sua carteira. Regularize para solicitar uma corrida."}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/20 flex gap-3 items-center">
            <AlertTriangle className="text-red-500 shrink-0" size={20} />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </div>
        )}
      </div>

      <div className="px-5 py-6 bg-zinc-900/80 backdrop-blur-xl border-t border-white/5">
        <Button
          onClick={async () => {
            const response = await confirmRide();
            if (response?.ok && response.rideId) {
              navigate({ to: "/corrida/$rideId", params: { rideId: response.rideId } });
            }
          }}
          disabled={!checkout.readiness || isSubmitting}
          className={cn(
            "w-full h-16 rounded-2xl font-black text-lg transition-all active:scale-[0.98]",
            checkout.readiness && !isSubmitting
              ? "bg-apois-yellow text-black shadow-lg shadow-apois-yellow/10"
              : "bg-zinc-800 text-zinc-500 grayscale cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin" size={24} />
              <span>Solicitando corrida...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>Solicitar corrida</span>
              <ChevronRight size={24} strokeWidth={3} />
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
