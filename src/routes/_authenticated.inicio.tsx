import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { LocationStatus } from "@/components/location/LocationStatus";
import PassengerMap from "@/components/map/PassengerMap";
import { CategorySelector } from "@/components/pricing/CategorySelector";
import { RideStopsInput } from "@/components/rides/RideStopsInput";
import { ServiceDetailsForm } from "@/components/pricing/ServiceDetailsForm";
import { PaymentMethodSelector, PaymentMethodList } from "@/components/payments/PaymentMethodSelector";
import { CouponInput } from "@/components/coupons/CouponInput";
import { CheckoutSummary } from "@/components/pricing/CheckoutSummary";
import { FareDetails } from "@/components/pricing/FareDetails";
import { MapPin, ChevronRight, Settings2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: InicioPage,
});

function InicioPage() {
  const navigate = useNavigate();
  const { address, status: addressStatus } = usePickupAddress();
  const { destination, hasDestination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { initiateReview } = useRideRequest();
  const { refreshLocation, isLoading: isLocating } = useLocation();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const handleReview = () => {
    initiateReview();
    navigate({ to: "/revisar-solicitacao" });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-white relative overflow-hidden">
      <div className="flex-1 relative min-h-0">
        <PassengerMap 
          origin={undefined}
          destination={undefined}
          encodedPolyline={route?.encodedPolyline}
          driverLocation={undefined}
          isStatic={false}
        />

        
        {/* Overlay superior */}
        <div className="absolute top-safe left-5 right-5 z-20 space-y-3">
          <LocationStatus />
          
          <div 
            onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
            role="button"
            tabIndex={0}
            aria-label="Escolher destino"
            className="bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 active:scale-[0.98] focus:ring-2 focus:ring-apois-yellow outline-none transition-all cursor-pointer"
          >

            <div className="w-10 h-10 bg-apois-yellow rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="text-black" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-apois-yellow mb-0.5">Para onde vamos?</p>
              <p className="text-sm font-bold truncate text-white">
                {addressStatus === "identifying" ? "Identificando sua localização…" : (address || "Toque para definir destino")}
              </p>
            </div>
            <ChevronRight size={20} className="text-apois-yellow" />
          </div>

        </div>

        {/* Botão de Recentralização */}
        <div className="absolute right-5 bottom-80 z-20">
          <button
            type="button"
            onClick={() => refreshLocation()}
            disabled={isLocating}
            aria-label="Recentralizar no mapa"
            className="w-12 h-12 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center text-apois-yellow shadow-2xl active:scale-90 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-5 h-5", isLocating && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Painel inferior */}
      <div className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-20 p-5 pointer-events-none max-h-[60vh] flex flex-col justify-end">
        <div className="bg-[#1e1e1e] backdrop-blur-lg rounded-3xl border border-white/10 shadow-2xl pointer-events-auto overflow-hidden flex flex-col">
          <div className="overflow-y-auto no-scrollbar pt-5 pb-5">

          {(hasDestination || route) ? (
            <div className="animate-in fade-in slide-in-from-bottom duration-500 space-y-4">
              <div className="px-5 flex items-center justify-between">
                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Escolha a Categoria</p>
                 {selectedCategory && (selectedCategory.code === 'fretes' || selectedCategory.code === 'guincho' || selectedCategory.code === 'envios') && (
                   <button 
                     type="button"
                     onClick={() => setIsFormOpen(true)}
                     className="flex items-center gap-1.5 text-apois-yellow font-bold text-xs"
                   >
                     <Settings2 size={14} />
                     Detalhes
                   </button>
                 )}
              </div>
              
              <RideStopsInput />
              <CategorySelector />
              
              <div className="px-5 space-y-4">
                <PaymentMethodSelector onOpenList={() => setIsPaymentListOpen(true)} />
                <CouponInput />
                
                <div className="pt-2">
                  <FareDetails />
                  <CheckoutSummary />
                </div>
              </div>

              <div className="px-5 pt-4 border-t border-white/5">
                <button 
                  type="button"
                  onClick={handleReview}
                  disabled={!checkout.readiness}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-5 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                    checkout.readiness
                      ? "bg-apois-yellow text-black shadow-apois-yellow/20" 
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                  )}
                >
                  Revisar Solicitação
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-5">
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner">
                  <MapPin className="text-apois-yellow" size={28} />
                </div>
                <div className="space-y-1">
                  <p className="text-white font-bold text-base">
                    Para onde vamos hoje?
                  </p>
                  <p className="text-zinc-500 font-medium text-xs max-w-[240px]">
                    Defina um destino para ver as categorias e preços disponíveis.
                  </p>
                </div>
                <button 
                  onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
                  className="mt-2 w-full py-4 bg-apois-yellow text-black font-black rounded-2xl active:scale-95 shadow-lg shadow-apois-yellow/10 uppercase tracking-widest text-xs"
                >
                  Escolher destino
                </button>

              </div>
            </div>
          )}
          </div>
        </div>
      </div>


      <ServiceDetailsForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
      />
      
      <PaymentMethodList 
        isOpen={isPaymentListOpen}
        onClose={() => setIsPaymentListOpen(false)}
      />
    </div>
  );
}
