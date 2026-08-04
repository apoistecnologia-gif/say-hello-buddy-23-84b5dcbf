import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePricing } from "@/hooks/use-pricing";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useCoupon } from "@/hooks/use-coupon";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { LocationStatus } from "@/components/location/LocationStatus";
import PassengerMap from "@/components/map/PassengerMap";
import { RouteSummary } from "@/components/route/RouteSummary";
import { CategorySelector } from "@/components/pricing/CategorySelector";
import { FareDetails } from "@/components/pricing/FareDetails";
import { ServiceDetailsForm } from "@/components/pricing/ServiceDetailsForm";
import { PaymentMethodSelector, PaymentMethodList } from "@/components/payments/PaymentMethodSelector";
import { CouponInput } from "@/components/coupons/CouponInput";
import { CheckoutSummary } from "@/components/pricing/CheckoutSummary";
import { MapPin, Shield, AlertCircle, Loader2, X, ChevronRight, Settings2, Wallet } from "lucide-react";

export const Route = createFileRoute("/inicio")({
  component: InicioPage,
});

function InicioPage() {
  const navigate = useNavigate();
  const { accuracyQuality } = useLocation();
  const { address, status: pickupStatus, isLoading: isPickupLoading, error: pickupError, refreshAddress } = usePickupAddress();
  const { destination, clearDestination, hasDestination } = useDestination();
  const { route, status: routeStatus, clearRoute } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { estimate, status: pricingStatus } = usePricing();
  const { checkout } = useCheckoutPreparation();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const handleOpenSearch = () => {
    navigate({ to: '/buscar-destino' });
  };

  const handleClearDestination = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearDestination();
    clearRoute();
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
            
            {isPickupLoading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />
                <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
              </div>
            ) : pickupError ? (
              <button 
                onClick={() => refreshAddress()}
                className="flex items-center gap-2 py-2 text-red-400 group active:scale-[0.98]"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{pickupError.message} (Toque para tentar)</span>
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
            aria-label={hasDestination ? `Destino selecionado: ${destination?.label}. Toque para alterar.` : "Para onde vamos?"}
            className="w-full bg-[#2a2a2a] text-left px-4 py-4 rounded-xl font-bold text-lg border border-gray-700/50 shadow-inner flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
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
                aria-label="Limpar destino"
                className="p-2 -mr-1 text-gray-500 active:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Floating Area */}
      <div className="mt-auto relative z-10 p-4 pb-24">
        {/* Floating SOS and Re-center buttons */}
        <div className="flex justify-end mb-4">
          <button className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-black/20 active:scale-90 transition-transform">
            <Shield className="w-7 h-7 text-white" />
          </button>
        </div>

        {/* Route Summary and Categories Panel */}
        <div className="transition-all duration-500 ease-in-out space-y-3">
          {(hasDestination || route) && (
            <div className="animate-in slide-in-from-bottom duration-500">
              <RouteSummary />
            </div>
          )}
          
          <div className="bg-[#1e1e1e]/95 backdrop-blur-lg rounded-3xl pt-5 pb-5 border border-white/5 shadow-2xl">
            {(hasDestination || route) ? (
              <div className="animate-in fade-in slide-in-from-bottom duration-500">
                <div className="px-5 mb-4 flex items-center justify-between">
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
                
                <CategorySelector />
                
                <div className="px-5 pt-4 border-t border-white/5 flex items-center justify-between">
                  <FareDetails />
                  
                  <button 
                    disabled={pricingStatus !== "success"}
                    className={cn(
                      "flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                      pricingStatus === "success" 
                        ? "bg-apois-yellow text-black shadow-apois-yellow/20" 
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    )}
                  >
                    Confirmar {selectedCategory?.label || "Viagem"}
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
    </div>
  );
}

// Utility function used in the component
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
