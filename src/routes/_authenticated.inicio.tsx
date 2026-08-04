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
import { MapPin, ChevronRight, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: InicioPage,
});

function InicioPage() {
  const navigate = useNavigate();
  const { address } = usePickupAddress();
  const { destination, hasDestination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { initiateReview } = useRideRequest();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const handleReview = () => {
    initiateReview();
    navigate({ to: "/revisar-solicitacao" });
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white relative">
      <div className="flex-1 relative">
        <PassengerMap 
          origin={undefined}
          destination={undefined}
          encodedPolyline={undefined}
          driverLocation={undefined}
          isStatic={false}
        />
        
        {/* Overlay superior */}
        <div className="absolute top-safe left-5 right-5 z-20 space-y-3">
          <LocationStatus />
          
          <div 
            onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
            className="bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-4 active:scale-[0.98] transition-all"
          >
            <div className="w-10 h-10 bg-apois-yellow rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="text-black" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-apois-yellow mb-0.5">Para onde vamos?</p>
              <p className="text-sm font-bold truncate">
                {destination?.formattedAddress || destination?.label || "Toque para definir destino"}
              </p>
            </div>
          </div>
        </div>

        {/* Painel inferior */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-5 pointer-events-none">
          <div className="bg-[#1e1e1e]/95 backdrop-blur-lg rounded-3xl pt-5 pb-5 border border-white/5 shadow-2xl pointer-events-auto">
            {(hasDestination || route) ? (
              <div className="animate-in fade-in slide-in-from-bottom duration-500 space-y-4">
                <div className="px-5 flex items-center justify-between">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Escolha a Categoria</p>
                   {selectedCategory && (selectedCategory.key === 'fretes' || selectedCategory.key === 'guincho' || selectedCategory.key === 'envios') && (
                     <button 
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
                    <CheckoutSummary />
                  </div>
                </div>

                <div className="px-5 pt-4 border-t border-white/5">
                  <button 
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
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
                    <MapPin className="text-zinc-500" size={24} />
                  </div>
                  <p className="text-zinc-400 font-medium text-sm">
                    Defina um destino para ver as categorias e preços disponíveis.
                  </p>
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
