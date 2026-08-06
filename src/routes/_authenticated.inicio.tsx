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
    <div className="absolute inset-0 bg-[#0A0D14] overflow-hidden flex flex-col">
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

      {/* HEADER COMPACTO (REFERÊNCIA À IMAGEM) */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+12px)] left-4 right-4 z-20">
        <div className="bg-[#1A1D24]/80 backdrop-blur-md border border-white/5 rounded-full px-2 py-1.5 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border-2 border-green-500 overflow-hidden bg-zinc-800">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-black text-xs">
                    {readString(profile?.full_name || profile?.name, "P")[0]}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">🌙</span>
                <h1 className="text-sm font-bold text-white tracking-tight">
                  Boa noite, {readString(profile?.full_name || profile?.name, "Franciel").split(" ")[0]}
                </h1>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-green-500 fill-green-500/20" />
                <span className="text-[10px] text-zinc-500 font-medium">1 motorista próximo</span>
              </div>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95 transition-all">
            <div className="flex flex-col gap-1 w-5">
              <div className="h-0.5 w-full bg-white rounded-full opacity-70" />
              <div className="h-0.5 w-full bg-white rounded-full opacity-70" />
              <div className="h-0.5 w-full bg-white rounded-full opacity-70" />
            </div>
          </button>
        </div>
      </div>

      {/* RE-CENTER / GPS STATUS BUTTON */}
      <div className="absolute right-4 bottom-[38%] z-20 flex flex-col gap-3">
        {locationError && (
          <div className="bg-red-500 text-white text-[10px] px-2 py-1 rounded-lg font-bold animate-bounce shadow-lg">
            GPS OFF
          </div>
        )}
        <button
          type="button"
          onClick={() => refreshLocation()}
          disabled={isLocating}
          className="w-12 h-12 bg-[#1A1D24] border border-white/10 rounded-full flex items-center justify-center text-apois-yellow shadow-2xl active:scale-90 transition-all disabled:opacity-50"
        >
          <div className="relative">
             <div className="absolute inset-0 bg-apois-yellow/20 rounded-full blur-sm" />
             <Navigation className={cn("w-5 h-5 relative z-10 fill-current", isLocating && "animate-pulse")} />
          </div>
        </button>
      </div>

      {/* PAINEL DE DESTINO (ESTILO IMAGEM) */}
      <div className="absolute bottom-0 left-0 right-0 z-[60] p-4 bg-gradient-to-t from-black via-[#0A0D14] to-transparent pt-12">
        <div className="max-w-[430px] mx-auto space-y-5">
          
          {/* ENDEREÇO ATUAL (INDICADOR) */}
          <div 
            onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
            className="flex items-center gap-3 px-1 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-apois-yellow/10 flex items-center justify-center border border-apois-yellow/20">
              <MapPin size={14} className="text-apois-yellow" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white tracking-tight group-active:text-apois-yellow transition-colors">
                {currentAddressText}
              </p>
            </div>
            <div className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center">
              <Navigation size={12} className="text-zinc-500" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-400">Olá,</span>
                <span className="text-sm font-black text-apois-yellow uppercase tracking-tighter">
                  {readString(profile?.full_name || profile?.name, "Franciel").split(" ")[0]} 👋
                </span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">
                Para onde vamos?
              </h2>
            </div>

            {/* INPUT DE BUSCA */}
            <div
              onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
              className="w-full bg-[#1A1D24] border border-white/5 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all cursor-pointer shadow-2xl"
            >
              <div className="w-10 h-10 bg-apois-yellow/10 rounded-xl flex items-center justify-center">
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-apois-yellow rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-apois-yellow rounded-full" />
                  </div>
                </div>
              </div>
              <span className="text-zinc-500 font-medium text-base">
                Digite um endereço, bairro ou lugar
              </span>
            </div>

            {/* ATALHOS RÁPIDOS */}
            <div className="flex items-center gap-3 pt-2">
              <button 
                onClick={() => navigate({ to: "/buscar-destino", search: { stop: false } })}
                className="flex-1 py-3.5 px-4 bg-[#1A1D24] border border-white/5 rounded-xl flex items-center justify-center gap-2 font-bold text-white text-sm active:scale-95 transition-all shadow-lg"
              >
                <span className="text-lg">+</span>
                Adicionar favorito
              </button>
              <button className="flex-1 py-3.5 px-4 bg-apois-yellow/10 border border-apois-yellow/20 rounded-xl flex items-center justify-center gap-2 font-bold text-apois-yellow text-sm active:scale-95 transition-all shadow-lg">
                <div className="w-5 h-5 bg-apois-yellow flex items-center justify-center rounded-sm">
                   <div className="w-3 h-3 border border-black/50" />
                </div>
                Serviços
              </button>
            </div>
          </div>

          {/* ESPAÇADOR PARA O TECLADO / HOME INDICATOR */}
          <div className="h-[env(safe-area-inset-bottom)]" />
        </div>
      </div>

      {/* ESTADO DE ROTA SELECIONADA (MODAL SOBREPOSTO SE HOUVER DESTINO) */}
      {(hasDestination || route) && (
        <BottomSheet 
          isOpen={true} 
          onClose={() => {}} 
          preventClose={true}
          showBackdrop={false}
        >
          <div className="w-full">
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

              <div className="pt-2 pb-4">
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
          </div>
        </BottomSheet>
      )}

      <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
      <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
    </div>
  );
}