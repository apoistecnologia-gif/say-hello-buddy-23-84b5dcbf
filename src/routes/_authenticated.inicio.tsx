import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Briefcase,
  ChevronRight,
  Clock3,
  Grid2X2,
  Home,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  User,
  WalletCards,
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
import { useWallet } from "@/hooks/use-wallet";
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
import type { RideCategoryCode } from "@/types/pricing";
import type { DestinationHistoryItem } from "@/types/destinations";

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

const categoryArtwork: Record<RideCategoryCode, string> = {
  carros: "/assets/ride-categories/carros.svg",
  motos: "/assets/ride-categories/motos.svg",
  fretes: "/assets/ride-categories/fretes.svg",
  guincho: "/assets/ride-categories/guincho.svg",
  envios: "/assets/ride-categories/envios.svg",
};

function InicioPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wallet } = useWallet();
  const { address, status: addressStatus, isLoading: isGeocoding } = usePickupAddress();
  const { destination, hasDestination, clearDestination, setDestination } = useDestination();
  const { recent, favorites } = useDestinationHistory();
  const {
    route,
    status: routeStatus,
    error: routeError,
    retry: retryRoute,
    clearRoute,
  } = useRoute();
  const { categories, selectedCategory, selectCategory } = useRideCategories();
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

  const chooseSavedDestination = (item: DestinationHistoryItem) => {
    setDestination({
      label: item.nickname || item.label,
      formattedAddress: item.formattedAddress,
      latitude: item.latitude,
      longitude: item.longitude,
      placeId: item.placeId,
    });
  };

  if (hasDestination) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black text-white">
        <div className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black/96 pb-2 pt-2 backdrop-blur-xl">
          <div className="flex h-11 items-center justify-between">
            <button type="button" onClick={handleClearDestination} className="app-pressable flex h-10 w-10 items-center justify-center rounded-xl text-apois-yellow" aria-label="Voltar">
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
              <button type="button" onClick={() => void handleLocationAction()} className="app-pressable flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow"><Navigation size={16} /></span>
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
              <button type="button" onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })} className="app-pressable flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-apois-yellow/25 bg-apois-yellow/10 text-apois-yellow"><MapPin size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-medium text-zinc-500">Para onde vamos?</span>
                  <span className="mt-0.5 block truncate text-[13px] font-bold text-white">{destination?.label || destination?.formattedAddress}</span>
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-black/30 text-apois-yellow"><ChevronRight size={16} /></span>
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
                  <span>{routeDistance}</span><span className="text-zinc-600">•</span><span>{routeDuration}</span>
                </div>
              ) : null}
            </div>

            {routeIsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-apois-yellow/15 bg-apois-yellow/8 px-3 py-2 text-apois-yellow">
                <Loader2 size={14} className="animate-spin" /><p className="text-[11px] font-bold">Calculando rota e valores...</p>
              </div>
            ) : null}

            {routeError ? (
              <div className="rounded-xl border border-apois-danger/20 bg-apois-danger/10 p-3">
                <div className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0 text-apois-danger" /><p className="flex-1 text-[11px] font-medium leading-4 text-red-300">{routeError}</p></div>
                <button type="button" onClick={() => void retryRoute()} className="app-pressable mt-2 min-h-9 w-full rounded-lg border border-apois-danger/20 bg-black/20 px-3 text-[11px] font-black text-white">Calcular novamente</button>
              </div>
            ) : null}

            <section className="rounded-2xl border border-white/8 bg-[#0e1014] p-2.5 shadow-lg">
              <div className="mb-2 flex items-center justify-between px-1">
                <div>
                  <p className="text-[13px] font-black text-white">Escolha a categoria ideal para você</p>
                  <p className="mt-0.5 text-[9px] font-medium text-zinc-600">Preço e tempo calculados para sua rota</p>
                </div>
                {selectedCategory && ["fretes", "guincho", "envios"].includes(selectedCategory.code) ? (
                  <button type="button" onClick={() => setIsFormOpen(true)} className="app-pressable flex items-center gap-1 rounded-lg border border-apois-yellow/20 bg-apois-yellow/8 px-2 py-1 text-[10px] font-black text-apois-yellow">
                    <Settings2 size={12} />Detalhes
                  </button>
                ) : null}
              </div>
              <CategorySelector />
            </section>

            <RideStopsInput />
            <div className="rounded-2xl border border-white/8 bg-[#0e1014] p-2.5"><CouponInput /></div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-black/96 px-3 pt-2 shadow-[0_-16px_40px_rgba(0,0,0,0.72)] backdrop-blur-xl" style={{ paddingBottom: "max(10px, var(--app-safe-bottom))" }}>
          <div className="mx-auto max-w-[430px] rounded-2xl border border-white/8 bg-[#111317] p-2.5 shadow-2xl">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <PaymentMethodSelector onOpenList={() => setIsPaymentListOpen(true)} />
              <div className="flex min-w-[116px] flex-col justify-center rounded-2xl border border-white/5 bg-black/30 px-3">
                <p className="text-[9px] font-bold text-zinc-500">Preço estimado</p>
                <p className="mt-0.5 text-[20px] font-black leading-none text-white">{checkout.finalTotal > 0 ? formatCurrency(checkout.finalTotal) : "—"}</p>
                <p className="mt-1 text-[9px] font-black text-apois-yellow">Ver detalhes</p>
              </div>
            </div>
            <button type="button" onClick={handleReview} disabled={!checkout.readiness || Boolean(routeError) || routeIsLoading} className={cn("app-pressable mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-black shadow-lg", checkout.readiness && !routeError && !routeIsLoading ? "app-gold-glow bg-apois-yellow text-black" : "bg-zinc-800 text-zinc-600")}>Confirmar corrida<ChevronRight size={19} strokeWidth={3} /></button>
          </div>
        </div>

        <ServiceDetailsForm isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} />
        <PaymentMethodList isOpen={isPaymentListOpen} onClose={() => setIsPaymentListOpen(false)} />
      </div>
    );
  }

  const homeFavorite = favorites.find((favorite) => favorite.icon === "home");
  const workFavorite = favorites.find((favorite) => favorite.icon === "briefcase");
  const suggestions = [...favorites, ...recent].filter((item, index, list) => list.findIndex((other) => other.placeId === item.placeId) === index).slice(0, 3);

  const quickItems = [
    { key: "home", icon: Home, title: "Casa", subtitle: homeFavorite?.nickname || homeFavorite?.label || "Adicionar", action: () => homeFavorite ? chooseSavedDestination(homeFavorite) : void navigate({ to: "/buscar-destino", search: { stop: false } }) },
    { key: "work", icon: Briefcase, title: "Trabalho", subtitle: workFavorite?.nickname || workFavorite?.label || "Adicionar", action: () => workFavorite ? chooseSavedDestination(workFavorite) : void navigate({ to: "/buscar-destino", search: { stop: false } }) },
    { key: "favorites", icon: Star, title: "Favoritos", subtitle: favorites.length ? `${favorites.length} salvo${favorites.length === 1 ? "" : "s"}` : "Ver todos", action: () => void navigate({ to: "/buscar-destino", search: { stop: false } }) },
    { key: "add", icon: Plus, title: "Adicionar", subtitle: "Novo local", action: () => void navigate({ to: "/buscar-destino", search: { stop: false } }) },
  ];

  const navItems = [
    { label: "Início", icon: Home, to: "/inicio" },
    { label: "Corridas", icon: Clock3, to: "/corridas" },
    { label: "Carteira", icon: WalletCards, to: "/carteira" },
    { label: "Notificações", icon: Bell, to: "/notificacoes" },
    { label: "Perfil", icon: User, to: "/perfil" },
  ] as const;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#05070a] text-white">
      <div className="absolute inset-x-0 top-[108px] bottom-[330px] z-0 overflow-hidden rounded-t-[28px]">
        <PassengerMap origin={location ? { lat: location.latitude, lng: location.longitude } : undefined} destination={undefined} encodedPolyline={undefined} driverLocation={undefined} isStatic={false} />
      </div>

      <header className="app-safe-top app-safe-x relative z-30 bg-black/96 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => void navigate({ to: "/perfil" })} className="app-pressable flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-apois-yellow/70 bg-[#17191e] text-sm font-black text-white">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="Foto do passageiro" className="h-full w-full object-cover" /> : avatarInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-black leading-tight text-white">{getGreeting()}, <span className="text-apois-yellow">{firstName}</span> 👋</span>
              <span className="mt-1 block truncate text-[12px] font-medium text-zinc-500">Para onde vamos hoje?</span>
            </span>
          </button>

          <button type="button" onClick={() => void navigate({ to: "/carteira" })} className="app-pressable flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-[#111317] px-3 text-left shadow-lg">
            <WalletCards size={18} className="text-apois-yellow" />
            <span className="text-[14px] font-black text-white">{wallet ? formatCurrency(wallet.available_balance) : "—"}</span>
            <ChevronRight size={16} className="text-zinc-600" />
          </button>
        </div>
      </header>

      {!location ? (
        <div className="app-safe-x relative z-30 mt-2">
          <button type="button" onClick={() => void handleLocationAction()} className="app-pressable flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-[#17191e]/95 p-3 text-left shadow-2xl backdrop-blur-xl">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow"><MapPin size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-black">Ative sua localização</span><span className="mt-0.5 block text-[11px] text-zinc-500">Precisamos dela para encontrar motoristas e calcular sua rota.</span></span>
            <span className="text-[13px] font-black text-apois-yellow">Ativar</span>
          </button>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-1/2 top-[250px] z-20 -translate-x-1/2 rounded-full border border-apois-yellow/50 bg-black/85 px-4 py-2 text-[12px] font-black text-white shadow-xl backdrop-blur-md">Me buscar aqui</div>
      )}

      {locationError ? (
        <button type="button" onClick={() => void handleLocationAction()} className="app-pressable absolute right-4 top-[190px] z-30 max-w-[190px] rounded-xl border border-apois-danger/25 bg-black/90 px-3 py-2 text-left shadow-xl"><span className="text-[10px] font-black text-apois-danger">Localização indisponível</span></button>
      ) : null}

      <button type="button" onClick={() => void handleLocationAction()} disabled={isLocating} className="app-pressable absolute right-4 top-[360px] z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-black/90 text-white shadow-xl disabled:opacity-50" aria-label="Atualizar minha localização">
        {isLocating ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
      </button>

      <section className="absolute inset-x-0 bottom-[82px] z-30 max-h-[54dvh] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-black/97 px-3 pb-4 pt-3 shadow-[0_-22px_60px_rgba(0,0,0,.75)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-700" />
        <button type="button" onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })} className="app-pressable flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-[#111317] p-3 text-left shadow-lg">
          <Search size={20} className="text-apois-yellow" />
          <span className="flex-1 text-[15px] font-bold text-zinc-400">Para onde vamos?</span>
          <span className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] font-bold text-zinc-300"><Clock3 size={14} className="text-apois-yellow" />Agora</span>
        </button>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {quickItems.map(({ key, icon: Icon, title, subtitle, action }) => (
            <button key={key} type="button" onClick={action} className="app-pressable flex min-w-0 flex-col items-center rounded-2xl border border-white/8 bg-[#111317] px-1.5 py-3 text-center shadow-lg">
              <Icon size={20} className="text-apois-yellow" />
              <span className="mt-2 block w-full truncate text-[10px] font-black text-white">{title}</span>
              <span className="mt-0.5 block w-full truncate text-[9px] text-zinc-600">{subtitle}</span>
            </button>
          ))}
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-black text-white">Sugestões para você</p><button type="button" onClick={() => void navigate({ to: "/buscar-destino", search: { stop: false } })} className="text-[11px] font-black text-apois-yellow">Ver todas</button></div>
            <div className="space-y-1.5">
              {suggestions.map((item) => (
                <button key={item.id} type="button" onClick={() => chooseSavedDestination(item)} className="app-pressable flex w-full items-center gap-3 rounded-2xl border border-white/7 bg-[#111317] px-3 py-2.5 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow"><MapPin size={16} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-black text-white">{item.nickname || item.label}</span><span className="mt-0.5 block truncate text-[10px] text-zinc-600">{item.formattedAddress}</span></span>
                  <Star size={17} className={item.favorite ? "fill-apois-yellow text-apois-yellow" : "text-zinc-600"} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {categories.map((category) => (
            <button key={category.id} type="button" onClick={() => { selectCategory(category); void navigate({ to: "/buscar-destino", search: { stop: false } }); }} className="app-pressable flex w-[104px] shrink-0 flex-col rounded-2xl border border-white/8 bg-[#111317] p-2.5 text-left shadow-lg">
              <span className="text-[11px] font-black text-white">{category.name}</span>
              <span className="mt-2 flex h-[52px] items-center justify-center overflow-hidden"><img src={category.imageUrl || categoryArtwork[category.code]} alt="" aria-hidden="true" className="h-full w-full object-contain" /></span>
              <span className="mt-2 text-[9px] font-medium text-zinc-600">Toque para calcular</span>
            </button>
          ))}
        </div>
      </section>

      <nav className="app-safe-x absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/98 pt-2 shadow-[0_-12px_30px_rgba(0,0,0,.55)]" style={{ paddingBottom: "max(8px, var(--app-safe-bottom))" }}>
        <div className="grid grid-cols-5 gap-1">
          {navItems.map(({ label, icon: Icon, to }) => (
            <button key={label} type="button" onClick={() => void navigate({ to })} className={cn("app-pressable flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold", label === "Início" ? "text-apois-yellow" : "text-zinc-500")}>
              <Icon size={21} />{label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
