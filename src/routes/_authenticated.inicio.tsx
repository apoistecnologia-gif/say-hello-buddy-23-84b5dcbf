import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useRoute } from "@/hooks/use-route";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { useCheckoutPreparation } from "@/hooks/use-checkout-preparation";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
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
import { MapPin, ChevronRight, Settings2, RefreshCw, Navigation, AlertCircle, Home, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: InicioPage,
});

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function HomeWorkShortcuts() {
  const navigate = useNavigate();
  const { favorites } = useDestinationHistory();
  const { setDestination } = useDestination();

  const homeFav = favorites.find((f) => f.icon === "home");
  const workFav = favorites.find((f) => f.icon === "briefcase");

  const handleShortcut = (type: "home" | "briefcase") => {
    const fav = type === "home" ? homeFav : workFav;
    if (fav) {
      setDestination({
        label: fav.label,
        formattedAddress: fav.formattedAddress,
        latitude: fav.latitude,
        longitude: fav.longitude,
        placeId: fav.placeId,
      });
    } else {
      navigate({ to: "/buscar-destino", search: { stop: false } });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div 
        onClick={() => handleShortcut("home")}
        className="bg-zinc-900/80 p-4 rounded-2xl border border-white/5 flex items-center gap-3 cursor-pointer active:scale-95 transition-all"
      >
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          homeFav ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-600"
        )}>
          <Home size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black text-white uppercase tracking-tighter">
            {homeFav ? "CASA" : "ADD CASA"}
          </span>
          <span className="text-[10px] text-zinc-500 truncate w-[80px]">
            {homeFav ? homeFav.label : "Sua residência"}
          </span>
        </div>
      </div>
      <div 
        onClick={() => handleShortcut("briefcase")}
        className="bg-zinc-900/80 p-4 rounded-2xl border border-white/5 flex items-center gap-3 cursor-pointer active:scale-95 transition-all"
      >
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          workFav ? "bg-orange-500/20 text-orange-400" : "bg-zinc-800 text-zinc-600"
        )}>
          <Briefcase size={18} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black text-white uppercase tracking-tighter">
            {workFav ? "TRABALHO" : "ADD TRAMPO"}
          </span>
          <span className="text-[10px] text-zinc-500 truncate w-[80px]">
            {workFav ? workFav.label : "Seu escritório"}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useDestinationHistory } from "@/hooks/use-destination-history";

function InicioPage() {
  const navigate = useNavigate();
  const { address, status: addressStatus, isLoading: isGeocoding } = usePickupAddress();
  const { profile } = useAuth();
  const { destination, hasDestination } = useDestination();
  const { route, status: routeStatus, error: routeError } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { initiateReview } = useRideRequest();
  const { location, refreshLocation, isLoading: isLocating, permissionState, error: locationError } = useLocation();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const handleReview = () => {
    initiateReview();
    navigate({ to: "/revisar-solicitacao" });
  };

  const currentAddressText = addressStatus === "identifying" || isGeocoding
    ? "Buscando localização..." 
    : address || "Sua localização atual";

  return (
    <div className="absolute inset-0 bg-zinc-950 overflow-hidden flex flex-col">
      {/* MAPA FULLSCREEN */}
      <div className="absolute inset-0 z-0">
        <PassengerMap
          origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
          destination={destination ? { lat: destination.latitude, lng: destination.longitude } : undefined}
          encodedPolyline={route?.encodedPolyline}
          driverLocation={undefined}
          isStatic={false}
        />
      </div>

      {/* GREETING CARD - FLOATING */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-4 right-4 z-20">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <h1 className="text-xs font-black text-white uppercase tracking-tighter opacity-70">
              Olá, {readString(profile?.full_name || profile?.name, "Passageiro").split(" ")[0]}
            </h1>
            <p className="text-[13px] font-bold text-white truncate max-w-[220px]">
              {currentAddressText}
            </p>
          </div>
          <div className="w-10 h-10 bg-apois-yellow rounded-2xl flex items-center justify-center shadow-lg shadow-apois-yellow/20 cursor-pointer active:scale-95 transition-all">
            <Settings2 size={20} className="text-black" />
          </div>
        </div>
      </div>

      {/* DESTINATION CARD - FLOATING (UBER STYLE) */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+88px)] left-4 right-4 z-20">
        <div
          onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
          role="button"
          tabIndex={0}
          className="w-full bg-white rounded-2xl flex items-center gap-4 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.2)] active:scale-[0.98] transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center shrink-0">
            <div className="w-2.5 h-2.5 bg-black rounded-sm" />
          </div>
          <div className="flex-1 border-l border-zinc-100 pl-4">
            <p className="text-zinc-400 font-bold text-xs uppercase tracking-tight">
              De: {currentAddressText.split(',')[0]}
            </p>
            <p className="text-black font-black text-[15px] uppercase tracking-tighter">
              Para onde vamos?
            </p>
          </div>
          <ChevronRight size={20} className="text-zinc-300 mr-2" />
        </div>
      </div>

      {/* RE-CENTER BUTTON */}
      <div className="absolute right-4 bottom-[42%] z-20 flex flex-col gap-3">
        {locationError && (
          <div className="bg-red-500 text-white text-[10px] px-2 py-1 rounded-lg font-bold animate-bounce whitespace-nowrap">
            Erro de GPS
          </div>
        )}
        <button
          type="button"
          onClick={() => refreshLocation()}
          disabled={isLocating}
          className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black shadow-xl active:scale-90 transition-all disabled:opacity-50"
        >
          <Navigation className={cn("w-5 h-5 fill-current", isLocating && "animate-pulse")} />
        </button>
      </div>

      {/* NATIVE BOTTOM SHEET */}
      <BottomSheet 
        isOpen={true} 
        onClose={() => {}} 
        preventClose={true}
        showBackdrop={false}
      >
        <div className="w-full">
          {hasDestination || route ? (
            <div className="animate-in fade-in slide-in-from-bottom duration-300 space-y-4">
              {routeError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-400 font-medium leading-tight">
                    {routeError}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Selecione sua categoria
                </p>
                {selectedCategory && ["fretes", "guincho", "envios"].includes(selectedCategory.code) && (
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

              <div className="space-y-4">
                <PaymentMethodSelector onOpenList={() => setIsPaymentListOpen(true)} />
                <CouponInput />

                <div className="pt-2">
                  <FareDetails />
                  <CheckoutSummary />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleReview}
                  disabled={!checkout.readiness || !!routeError}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-5 rounded-2xl font-black transition-all active:scale-95 shadow-lg",
                    checkout.readiness && !routeError
                      ? "bg-apois-yellow text-black shadow-apois-yellow/20"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  Confirmar {selectedCategory?.name || "Solicitação"}
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-2">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-black text-white tracking-tighter">Para onde vamos hoje?</h2>
                <p className="text-sm text-zinc-500 font-medium">
                  Atalhos salvos e destinos frequentes
                </p>
              </div>

              {/* FAVORITOS / ATALHOS */}
              <HomeWorkShortcuts />

              <button
                onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
                className="w-full py-5 bg-white text-black font-black rounded-2xl active:scale-95 shadow-xl uppercase tracking-tighter text-sm flex items-center justify-center gap-2"
              >
                <MapPin size={18} strokeWidth={3} />
                Escolher destino no mapa
              </button>
            </div>
          )}
        </div>
      </BottomSheet>

      <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
      <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
    </div>
  );
}