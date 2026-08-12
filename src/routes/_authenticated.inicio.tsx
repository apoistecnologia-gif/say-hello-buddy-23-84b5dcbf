import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Clock3,
  Grid2X2,
  Home,
  Loader2,
  MapPin,
  Menu,
  Navigation,
  Settings2,
  ShieldCheck,
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
import { cn, formatCurrency } from "@/lib/utils";

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

const formatRouteDistance = (distanceMeters?: number) => {
  if (!distanceMeters || distanceMeters <= 0) return null;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`;
};

const formatRouteDuration = (durationSeconds?: number) => {
  if (!durationSeconds || durationSeconds <= 0) return null;
  return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
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
  const { address, status: addressStatus, isLoading: isGeocoding } = usePickupAddress();
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
  const routeDistance = formatRouteDistance(route?.distanceMeters);
  const routeDuration = formatRouteDuration(route?.durationSeconds);

  const currentAddressText =
    addressStatus === "identifying" || isGeocoding
      ? "Identificando seu ponto de partida..."
      : address || (location ? "Sua localização atual" : "Ative a localização para continuar");

  const locationStatusText = location
    ? "Localização pronta"
    : permissionState === "granted"
      ? "Buscando sua localização"
      : "Localização necessária";

  const handleLocationAction = async () => {
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

  if (hasDestination) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black text-white">
        <div className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black/96 pb-2 pt-2 backdrop-blur-xl">
          <div className="flex h-11 items-center justify-between">
            <button
              type="button"
              onClick={handleClearDestination}
              className="app-pressable flex h-10 w-10 items-center justify-center rounded-xl text-apois-yellow"
              aria-label="Voltar"
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-[16px] font-black tracking-tight">Escolher categoria</h1>
            <div className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-[#111317] px-2.5 text-[10px] font-bold text-zinc-300">
              <ShieldCheck size={14} className="text-apois-yellow" />
              Segurança
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[150px] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto max-w-[430px] space-y-2.5">
            <div className="rounded-2xl border border-white/8 bg-[#111317] p-2.5 shadow-lg">
              <button
                type="button"
                onClick={() => void handleLocationAction()}
                className="app-pressable flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow">
                  <Navigation size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium text-zinc-500">De onde você está?</span>
                  <span className="mt-0.5 block truncate text-[13px] font-bold text-white">{currentAddressText}</span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/30 text-zinc-300">
                  {isLocating ? <Loader2 size={15} className="animate-spin" /> : <Navigation size={14} />}
                </span>
              </button>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#111317] p-2.5 shadow-lg">
              <button
                type="button"
                onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })}
                className="app-pressable flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow">
                  <MapPin size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium text-zinc-500">Para onde vamos?</span>
                  <span className="mt-0.5 block truncate text-[13px] font-bold text-white">
                    {destination?.label || destination?.formattedAddress}
                  </span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/30 text-apois-yellow">
                  <ChevronRight size={16} />
                </span>
              </button>
            </div>

            <div className="relative h-[164px] overflow-hidden rounded-2xl border border-white/8 bg-[#111317] shadow-xl">
              <PassengerMap
                origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
                destination={destination ? { lat: destination.latitude, lng: destination.longitude } : undefined}
                encodedPolyline={route?.encodedPolyline}
                driverLocation={undefined}
                isStatic={false}
                compact
              />
              {route && routeDistance && routeDuration ? (
                <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/85 px-3 py-1.5 text-[11px] font-bold text-white shadow-xl backdrop-blur-md">
                  <Clock3 size={13} className="text-zinc-300" />
                  <span>{routeDistance}</span>
                  <span className="text-zinc-600">•</span>
                  <span>{routeDuration}</span>
                </div>
              ) : null}
            </div>

            {routeIsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-apois-yellow/15 bg-apois-yellow/8 px-3 py-2 text-apois-yellow">
                <Loader2 size={14} className="animate-spin" />
                <p className="text-[11px] font-bold">Calculando rota e valores...</p>
              </div>
            ) : null}

            {routeError ? (
              <div className="rounded-xl border border-apois-danger/20 bg-apois-danger/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-apois-danger" />
                  <p className="flex-1 text-[11px] font-medium leading-4 text-red-300">{routeError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void retryRoute()}
                  className="app-pressable mt-2 min-h-9 w-full rounded-lg border border-apois-danger/20 bg-black/20 px-3 text-[11px] font-black text-white"
                >
                  Calcular novamente
                </button>
              </div>
            ) : null}

            <section className="rounded-2xl border border-white/8 bg-[#0e1014] p-2.5 shadow-lg">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p className="text-[13px] font-black text-white">Escolha a categoria ideal para você</p>
                  <p className="mt-0.5 text-[9px] font-medium text-zinc-600">Preço e tempo calculados para sua rota</p>
                </div>
                {selectedCategory && ["fretes", "guincho", "envios"].includes(selectedCategory.code) ? (
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(true)}
                    className="app-pressable flex items-center gap-1 rounded-lg border border-apois-yellow/20 bg-apois-yellow/8 px-2 py-1 text-[10px] font-black text-apois-yellow"
                  >
                    <Settings2 size={12} />
                    Detalhes
                  </button>
                ) : null}
              </div>
              <CategorySelector />
            </section>

            <RideStopsInput />

            <div className="rounded-2xl border border-white/8 bg-[#0e1014] p-2.5">
              <CouponInput />
            </div>
          </div>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-black/96 px-3 pt-2 shadow-[0_-16px_40px_rgba(0,0,0,0.72)] backdrop-blur-xl"
          style={{ paddingBottom: "max(10px, var(--app-safe-bottom))" }}
        >
          <div className="mx-auto max-w-[430px] rounded-2xl border border-white/8 bg-[#111317] p-2.5 shadow-2xl">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <PaymentMethodSelector onOpenList={() => setIsPaymentListOpen(true)} />
              <div className="flex min-w-[116px] flex-col justify-center rounded-2xl border border-white/5 bg-black/30 px-3">
                <p className="text-[9px] font-bold text-zinc-500">Preço estimado</p>
                <p className="mt-0.5 text-[20px] font-black leading-none text-white">
                  {checkout.finalTotal > 0 ? formatCurrency(checkout.finalTotal) : "—"}
                </p>
                <p className="mt-1 text-[9px] font-black text-apois-yellow">Ver detalhes</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReview}
              disabled={!checkout.readiness || Boolean(routeError) || routeIsLoading}
              className={cn(
                "app-pressable mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black shadow-lg",
                checkout.readiness && !routeError && !routeIsLoading
                  ? "app-gold-glow bg-apois-yellow text-black"
                  : "bg-zinc-800 text-zinc-600",
              )}
            >
              Confirmar corrida
              <ChevronRight size={19} strokeWidth={3} />
            </button>
          </div>
        </div>

        <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
        <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0d14]">
      <div className="absolute inset-0 z-0">
        <PassengerMap
          origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
          destination={undefined}
          encodedPolyline={undefined}
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

      <div className="relative z-30 mt-auto bg-gradient-to-t from-black via-[#080b11]/98 to-transparent px-4 pb-4 pt-12">
        <div className="mx-auto max-h-[58dvh] max-w-[430px] space-y-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })}
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
    </div>
  );
}
