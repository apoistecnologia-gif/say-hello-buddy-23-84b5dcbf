import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Grid2X2,
  Home,
  Loader2,
  MapPin,
  Menu,
  Navigation,
  Settings2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestination } from "@/hooks/use-destination";
import { useDestinationHistory } from "@/hooks/use-destination-history";
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
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inicio")({
  component: InicioPage,
});

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Boa madrugada";
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

const getFirstName = (name: string | null | undefined): string => {
  const normalized = name?.trim();
  return normalized?.split(/\s+/)[0] ?? "Passageiro";
};

function HomeWorkShortcuts() {
  const navigate = useNavigate();
  const { favorites } = useDestinationHistory();
  const { setDestination } = useDestination();

  const homeFavorite = favorites.find((favorite) => favorite.icon === "home");
  const workFavorite = favorites.find((favorite) => favorite.icon === "briefcase");

  const handleShortcut = (type: "home" | "briefcase") => {
    const favorite = type === "home" ? homeFavorite : workFavorite;

    if (!favorite) {
      void navigate({ to: "/buscar-destino", search: { stop: false } });
      return;
    }

    setDestination({
      label: favorite.label,
      formattedAddress: favorite.formattedAddress,
      latitude: favorite.latitude,
      longitude: favorite.longitude,
      placeId: favorite.placeId,
    });
  };

  const shortcuts = [
    {
      key: "home" as const,
      icon: Home,
      title: "Casa",
      description: homeFavorite?.label ?? "Adicionar endereço",
      configured: Boolean(homeFavorite),
    },
    {
      key: "briefcase" as const,
      icon: Briefcase,
      title: "Trabalho",
      description: workFavorite?.label ?? "Adicionar endereço",
      configured: Boolean(workFavorite),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {shortcuts.map(({ key, icon: Icon, title, description, configured }) => (
        <button
          key={key}
          type="button"
          onClick={() => handleShortcut(key)}
          className="app-pressable app-surface flex min-w-0 items-center gap-3 rounded-2xl p-3 text-left"
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              configured
                ? "border border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow"
                : "border border-white/8 bg-white/5 text-zinc-500",
            )}
          >
            <Icon aria-hidden="true" size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase tracking-tight text-white">{title}</span>
            <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function InicioPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const {
    address, status: addressStatus, isLoading: isGeocoding,
    error: addressError, refreshAddress, pickupPosition,
    isManualPickup, restoreGpsPickup,
  } = usePickupAddress();
  const { destination, hasDestination, clearDestination } = useDestination();
  const {
    route,
    status: routeStatus,
    error: routeError,
    retry: retryRoute,
    clearRoute,
  } = useRoute();
  const { selectedCategory } = useRideCategories();
  const { checkout } = useCheckoutPreparation();
  const { initiateReview } = useRideRequest();
  const {
    location,
    refreshLocation,
    requestPermission,
    openSettings,
    isLoading: isLocating,
    permissionState,
    error: locationError,
  } = useLocation();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPaymentListOpen, setIsPaymentListOpen] = useState(false);

  const firstName = getFirstName(profile?.name);
  const avatarInitial = firstName.charAt(0).toUpperCase();
  const routeIsLoading = routeStatus === "loading" || routeStatus === "debouncing";

  const currentAddressText =
    addressStatus === "identifying" || isGeocoding
      ? "Identificando seu ponto de partida..."
      : address || (addressError ? "Endereço indisponível" : location ? "Sua localização atual" : "Ative a localização para continuar");

  const locationStatusText = isManualPickup
    ? "Partida selecionada manualmente"
    : location
    ? (addressError ? "GPS pronto • endereço pendente" : "Localização pronta")
    : permissionState === "granted"
      ? "Buscando sua localização"
      : "Localização necessária";

  const handleLocationAction = async () => {
    if (isManualPickup) {
      restoreGpsPickup();
      await refreshLocation();
      return;
    }
    if (location && addressError) {
      await refreshAddress();
      return;
    }
    if (permissionState === "prompt" || permissionState === "unknown") {
      await requestPermission();
      return;
    }

    if (
      permissionState === "denied" ||
      permissionState === "blocked" ||
      permissionState === "unavailable"
    ) {
      await openSettings();
      return;
    }

    await refreshLocation();
  };

  const handleClearDestination = () => {
    clearDestination();
    clearRoute();
  };

  const handleReview = () => {
    if (!checkout.readiness || routeError || routeIsLoading) return;
    initiateReview();
    void navigate({ to: "/revisar-solicitacao" });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0d14]">
      <div className="absolute inset-0 z-0">
        <PassengerMap
          origin={pickupPosition ?? undefined}
          destination={destination ? { lat: destination.latitude, lng: destination.longitude } : undefined}
          encodedPolyline={route?.encodedPolyline}
          driverLocation={undefined}
          isStatic={false}
        />
      </div>

      <header className="app-safe-top app-safe-x relative z-20 pt-3">
        <div className="flex items-center justify-between rounded-full border border-white/7 bg-[#171a21]/88 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={() => void navigate({ to: "/perfil" })}
            className="app-pressable flex min-w-0 flex-1 items-center gap-3 rounded-full text-left"
            aria-label="Abrir meu perfil"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-apois-yellow/70 bg-zinc-800 text-xs font-black text-white">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Foto do passageiro" className="h-full w-full object-cover" />
              ) : (
                avatarInitial
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold tracking-tight text-white">
                {getGreeting()}, {firstName}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-zinc-500">
                <MapPin aria-hidden="true" size={10} className={location ? "text-apois-success" : "text-zinc-600"} />
                {locationStatusText}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => void navigate({ to: "/perfil" })}
            className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            aria-label="Abrir menu da conta"
          >
            <Menu aria-hidden="true" size={21} />
          </button>
        </div>
      </header>

      <div className="absolute right-4 top-[42%] z-20 flex -translate-y-1/2 flex-col items-end gap-3">
        {locationError ? (
          <button
            type="button"
            onClick={() => void handleLocationAction()}
            className="app-pressable max-w-[190px] rounded-2xl border border-apois-danger/25 bg-black/85 px-3 py-2 text-left shadow-xl backdrop-blur-xl"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-apois-danger">
              <AlertCircle aria-hidden="true" size={12} />
              Localização indisponível
            </span>
            <span className="mt-1 block text-[10px] leading-4 text-zinc-400">Toque para tentar resolver.</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void handleLocationAction()}
          disabled={isLocating}
          className="app-pressable flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#171a21] text-apois-yellow shadow-2xl disabled:opacity-50"
          aria-label="Atualizar minha localização"
        >
          {isLocating ? (
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          ) : (
            <Navigation aria-hidden="true" className="h-5 w-5 fill-current" />
          )}
        </button>
      </div>

      {!hasDestination ? (
        <div className="relative z-30 mt-auto bg-gradient-to-t from-black via-[#080b11]/98 to-transparent px-4 pb-4 pt-12">
          <div className="mx-auto max-h-[58dvh] max-w-[430px] space-y-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false, origin: true } })}
              className="app-pressable flex w-full items-center gap-3 rounded-2xl px-1 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/20 bg-apois-yellow/10 text-apois-yellow">
                <MapPin aria-hidden="true" size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-white">
                {currentAddressText}
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-500">
                <Navigation aria-hidden="true" size={12} />
              </span>
            </button>

            {addressError && !isManualPickup ? (
              <div role="alert" className="rounded-xl border border-amber-500/20 bg-black/85 p-3 text-xs text-zinc-300">
                <p>{addressError}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={isGeocoding}
                    onClick={() => void refreshAddress()}
                    className="app-pressable rounded-lg border border-white/20 px-3 py-2 font-bold text-white disabled:opacity-50">
                    Tentar novamente
                  </button>
                  <button type="button"
                    onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false, origin: true } })}
                    className="app-pressable rounded-lg bg-apois-yellow px-3 py-2 font-bold text-black">
                    Escolher partida
                  </button>
                </div>
              </div>
            ) : null}
            {isManualPickup ? (
              <button type="button" onClick={() => void handleLocationAction()}
                className="app-pressable w-full rounded-xl border border-white/15 bg-zinc-900/90 px-3 py-2 text-left text-xs font-bold text-apois-yellow">
                Voltar a usar minha localização GPS
              </button>
            ) : null}

            <div>
              <p className="text-sm font-bold text-apois-yellow">Olá, {firstName} 👋</p>
              <h1 className="mt-0.5 text-3xl font-black leading-tight tracking-[-0.04em] text-white">
                Para onde vamos?
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })}
              className="app-pressable app-surface flex w-full items-center gap-4 rounded-2xl p-4 text-left shadow-2xl"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-apois-yellow/10 text-apois-yellow">
                <MapPin aria-hidden="true" size={21} />
              </span>
              <span className="flex-1 text-base font-semibold text-zinc-400">Digite um endereço...</span>
              <ChevronRight aria-hidden="true" size={20} className="text-zinc-600" />
            </button>

            <HomeWorkShortcuts />

            <button
              type="button"
              onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })}
              className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-apois-yellow/20 bg-apois-yellow/10 px-4 text-sm font-black text-apois-yellow"
            >
              <Grid2X2 aria-hidden="true" size={18} />
              Ver serviços disponíveis
            </button>
          </div>
        </div>
      ) : null}

      {hasDestination ? (
        <BottomSheet
          isOpen
          onClose={handleClearDestination}
          preventClose
          showBackdrop={false}
          height="62dvh"
          maxHeight="560px"
        >
          <div className="w-full pb-4">
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom duration-300">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleClearDestination}
                  className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/5 text-white"
                  aria-label="Voltar e trocar destino"
                >
                  <ArrowLeft aria-hidden="true" size={19} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-apois-yellow">Seu destino</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-white">
                    {destination?.label || destination?.formattedAddress}
                  </p>
                </div>
              </div>

              {routeIsLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-apois-yellow/15 bg-apois-yellow/8 p-3 text-apois-yellow">
                  <Loader2 aria-hidden="true" size={18} className="shrink-0 animate-spin" />
                  <p className="text-xs font-bold">Calculando a melhor rota e os valores...</p>
                </div>
              ) : null}

              {routeError ? (
                <div className="rounded-2xl border border-apois-danger/20 bg-apois-danger/10 p-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-apois-danger" />
                    <p className="flex-1 text-xs font-medium leading-5 text-red-300">{routeError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retryRoute()}
                    className="app-pressable mt-3 min-h-10 w-full rounded-xl border border-apois-danger/20 bg-black/20 px-4 text-xs font-black text-white"
                  >
                    Calcular novamente
                  </button>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Selecione sua categoria
                </p>
                {selectedCategory && ["fretes", "guincho", "envios"].includes(selectedCategory.code) ? (
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(true)}
                    className="app-pressable flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-apois-yellow"
                  >
                    <Settings2 aria-hidden="true" size={14} />
                    Detalhes
                  </button>
                ) : null}
              </div>

              <RideStopsInput />
              <CategorySelector />

              <div className="space-y-4">
                <PaymentMethodSelector onOpenList={() => setIsPaymentListOpen(true)} />
                <CouponInput />
                <div className="pt-1">
                  <FareDetails />
                  <CheckoutSummary />
                </div>
              </div>

              <button
                type="button"
                onClick={handleReview}
                disabled={!checkout.readiness || Boolean(routeError) || routeIsLoading}
                className={cn(
                  "app-pressable flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl font-black shadow-lg",
                  checkout.readiness && !routeError && !routeIsLoading
                    ? "app-gold-glow bg-apois-yellow text-black"
                    : "bg-zinc-800 text-zinc-600",
                )}
              >
                Revisar {selectedCategory?.name || "solicitação"}
                <ChevronRight aria-hidden="true" size={20} strokeWidth={3} />
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
      <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
    </div>
  );
}
