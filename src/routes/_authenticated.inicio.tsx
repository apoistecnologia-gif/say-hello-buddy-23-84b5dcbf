import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
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
import {
  PaymentMethodSelector,
  PaymentMethodList,
} from "@/components/payments/PaymentMethodSelector";
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
  const { profile, authState } = useAuth();
  const { destination, hasDestination } = useDestination();
  const { route } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { initiateReview } = useRideRequest();
  const { location, refreshLocation, isLoading: isLocating } = useLocation();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const handleReview = () => {
    initiateReview();
    navigate({ to: "/revisar-solicitacao" });
  };

  return (
    <div className="flex flex-col flex-1 bg-black text-white relative overflow-hidden">
      {/* Debug Overlay - Somente em Dev (Oculto no Preview por padrão) */}
      {import.meta.env.DEV && import.meta.env["VITE_SHOW_DEBUG"] === "true" && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] bg-black/80 p-1 text-[8px] pointer-events-none w-full max-w-[430px]">
          Auth: {authState} | Loc: {location ? "Sim" : "Não"} | Addr: {addressStatus}
        </div>
      )}

      {/* Mapa como fundo principal */}
      <div className="absolute inset-0 z-0">
        <PassengerMap
          origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
          destination={undefined}
          encodedPolyline={route?.encodedPolyline}
          driverLocation={undefined}
          isStatic={false}
        />
      </div>

      {/* Cabeçalho Flutuante */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <h1 className="text-sm font-black text-white">
              Olá, {profile?.full_name?.split(" ")[0] || "Passageiro"}
            </h1>
            <p className="text-[11px] font-medium text-gray-300 truncate max-w-[200px]">
              {addressStatus === "identifying"
                ? "Identificando..."
                : address || "Sua localização atual"}
            </p>
          </div>
          <div className="w-10 h-10 bg-apois-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-apois-yellow/20 cursor-pointer active:scale-95 transition-all">
            <Settings2 size={20} className="text-black" />
          </div>
        </div>
      </div>

      {/* Campo de Destino Flutuante */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+84px)] left-0 right-0 z-20 px-4">
        <div
          onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
          role="button"
          tabIndex={0}
          className="w-full h-14 bg-white rounded-2xl flex items-center gap-4 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shrink-0">
            <MapPin className="text-apois-yellow" size={20} />
          </div>
          <div className="flex-1">
            <p className="text-black font-black text-sm uppercase tracking-tight group-active:text-zinc-700">
              Para onde vamos?
            </p>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              Informe seu destino
            </p>
          </div>
          <ChevronRight size={20} className="text-zinc-300" />
        </div>
      </div>

      {/* Botão de Recentralização */}
      <div className="absolute right-4 bottom-[calc(180px+env(safe-area-inset-bottom))] z-20">
        <button
          type="button"
          onClick={() => refreshLocation()}
          disabled={isLocating}
          className="w-12 h-12 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center text-apois-yellow shadow-2xl active:scale-90 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-5 h-5", isLocating && "animate-spin")} />
        </button>
      </div>

      {/* Painel Inferior Mobile (Compacto e Expansível) */}
      <div className="absolute bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-30 px-4">
        <div className="bg-[#1a1a1a] rounded-t-[32px] rounded-b-[32px] border border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.4)] overflow-hidden">
          {/* Drag Handle */}
          <div className="w-full flex justify-center py-3">
            <div className="w-12 h-1 bg-zinc-800 rounded-full" />
          </div>

          <div className="max-h-[50vh] overflow-y-auto no-scrollbar pb-6">
            {hasDestination || route ? (
              <div className="animate-in fade-in slide-in-from-bottom duration-300 space-y-4">
                <div className="px-5 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Categorias disponíveis
                  </p>
                  {selectedCategory &&
                    (selectedCategory.code === "fretes" ||
                      selectedCategory.code === "guincho" ||
                      selectedCategory.code === "envios") && (
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

                <div className="px-5 pt-4">
                  <button
                    type="button"
                    onClick={handleReview}
                    disabled={!checkout.readiness}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-5 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                      checkout.readiness
                        ? "bg-apois-yellow text-black shadow-apois-yellow/20"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                    )}
                  >
                    Revisar Solicitação
                    <ChevronRight size={20} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 space-y-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-black text-white">Para onde vamos hoje?</h2>
                  <p className="text-xs text-zinc-500 font-medium">
                    Escolha um destino ou use um atalho
                  </p>
                </div>

                {/* Favoritos / Atalhos */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col gap-2 cursor-pointer active:scale-95 transition-all">
                    <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-apois-yellow">
                      <MapPin size={18} />
                    </div>
                    <span className="text-xs font-bold">Casa</span>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-2xl border border-white/5 flex flex-col gap-2 cursor-pointer active:scale-95 transition-all">
                    <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-apois-yellow">
                      <RefreshCw size={18} />
                    </div>
                    <span className="text-xs font-bold">Trabalho</span>
                  </div>
                </div>

                {/* Ação Principal no Painel */}
                <button
                  onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
                  className="w-full py-4 bg-apois-yellow text-black font-black rounded-2xl active:scale-95 shadow-lg shadow-apois-yellow/10 uppercase tracking-widest text-xs"
                >
                  Escolher destino
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />

      <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
    </div>
  );
}
