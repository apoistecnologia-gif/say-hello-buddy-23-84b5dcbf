import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Check,
  Clock,
  Heart,
  Home,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import PassengerMap from "@/components/map/PassengerMap";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { useDestinationSearch } from "@/hooks/use-destination-search";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestinationHistory } from "@/hooks/use-destination-history";
import { useLocation } from "@/hooks/use-location";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { geocodingService } from "@/services/geocoding/geocoding-service";
import { placesService } from "@/services/places/places-service";
import type { DestinationHistoryItem, FavoriteIconType } from "@/types/destinations";
import type { DestinationAddress, PlaceSuggestion } from "@/types/places";

export const Route = createFileRoute("/_authenticated/buscar-destino")({
  validateSearch: (search: Record<string, unknown>) => ({
    stop: search["stop"] === true || search["stop"] === "true",
  }),
  component: BuscarDestinoPage,
});

type Coordinate = { lat: number; lng: number };

const readErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>)["message"];
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const historyItemToDestination = (item: DestinationHistoryItem): DestinationAddress => ({
  placeId: item.placeId,
  latitude: item.latitude,
  longitude: item.longitude,
  label: item.label,
  ...(item.subLabel ? { subLabel: item.subLabel } : {}),
  formattedAddress: item.formattedAddress,
  name: item.name,
  components: item.components,
  types: item.types,
  selectedAt: new Date().toISOString(),
  source: item.favorite ? "recent" : item.source,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { stop: isStopSelection } = Route.useSearch();
  const { pickupLabel } = usePickupAddress();
  const { location } = useLocation();
  const { setDestination } = useDestination();
  const { addStop, canAddStop } = useRideStops();
  const {
    recent,
    favorites,
    addToHistory,
    addFavorite,
    clearAllRecent,
  } = useDestinationHistory();
  const {
    query,
    suggestions,
    status,
    isLoading,
    error,
    setQuery,
    clearQuery,
    retry,
    reset,
  } = useDestinationSearch();

  const [isSelecting, setIsSelecting] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [mapCenter, setMapCenter] = useState<Coordinate | null>(null);
  const [isResolvingMap, setIsResolvingMap] = useState(false);
  const [mapSelectionError, setMapSelectionError] = useState<string | null>(null);
  const [pendingFavoriteIcon, setPendingFavoriteIcon] = useState<FavoriteIconType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const homeFavorite = favorites.find((favorite) => favorite.icon === "home");
  const workFavorite = favorites.find((favorite) => favorite.icon === "briefcase");
  const otherFavorites = favorites.filter(
    (favorite) => favorite.icon !== "home" && favorite.icon !== "briefcase",
  );

  useEffect(() => {
    if (!isBottomSheetOpen || isPickingOnMap) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [isBottomSheetOpen, isPickingOnMap]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (isSelecting || isResolvingMap) return;
    setIsBottomSheetOpen(false);
    reset();
    closeTimerRef.current = window.setTimeout(() => {
      void navigate({ to: "/inicio" });
    }, 220);
  }, [isResolvingMap, isSelecting, navigate, reset]);

  const savePendingFavorite = (details: DestinationAddress) => {
    if (!pendingFavoriteIcon) return;
    const nickname = pendingFavoriteIcon === "home" ? "Casa" : "Trabalho";
    addFavorite(details, nickname, pendingFavoriteIcon);
    setPendingFavoriteIcon(null);
    toast.success(`${nickname} salvo nos seus favoritos.`);
  };

  const handleFinalSelection = (details: DestinationAddress) => {
    if (isStopSelection && !canAddStop) {
      toast.error("Você já adicionou o limite de três paradas.");
      return;
    }

    savePendingFavorite(details);

    if (isStopSelection) {
      addStop({
        placeId: details.placeId,
        latitude: details.latitude,
        longitude: details.longitude,
        label: details.label,
        subLabel: details.subLabel || "",
        formattedAddress: details.formattedAddress,
        source: details.source === "google_places" ? "google_places" : "recent",
      });
    } else {
      setDestination({
        label: details.label,
        formattedAddress: details.formattedAddress,
        latitude: details.latitude,
        longitude: details.longitude,
        placeId: details.placeId,
      });
    }

    handleClose();
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (isSelecting) return;

    setIsSelecting(true);
    try {
      const details = await placesService.selectPrediction(suggestion);
      addToHistory(details);
      handleFinalSelection(details);
    } catch (selectionError: unknown) {
      toast.error(
        readErrorMessage(
          selectionError,
          "Não foi possível carregar os detalhes deste local.",
        ),
      );
    } finally {
      setIsSelecting(false);
    }
  };

  const handleSelectHistoryItem = (item: DestinationHistoryItem) => {
    const details = historyItemToDestination(item);
    addToHistory(details);
    handleFinalSelection(details);
  };

  const handleQuickAction = (type: "home" | "briefcase") => {
    const existing = type === "home" ? homeFavorite : workFavorite;
    if (existing) {
      handleSelectHistoryItem(existing);
      return;
    }

    setPendingFavoriteIcon(type);
    toast.info(
      `Pesquise e selecione o endereço para salvar como ${type === "home" ? "Casa" : "Trabalho"}.`,
    );
    inputRef.current?.focus();
  };

  const openMapPicker = () => {
    setMapCenter(
      location ? { lat: location.latitude, lng: location.longitude } : null,
    );
    setMapSelectionError(null);
    setIsBottomSheetOpen(false);
    setIsPickingOnMap(true);
  };

  const closeMapPicker = () => {
    if (isResolvingMap) return;
    setIsPickingOnMap(false);
    setMapSelectionError(null);
    setIsBottomSheetOpen(true);
  };

  const handleConfirmMapSelection = async () => {
    if (!mapCenter || isResolvingMap) {
      toast.error("Mova o mapa até o local desejado e tente novamente.");
      return;
    }

    setIsResolvingMap(true);
    setMapSelectionError(null);

    try {
      const resolved = await geocodingService.resolvePickupAddress(mapCenter);
      const formattedAddress =
        resolved.address ||
        [resolved.label, resolved.subLabel].filter(Boolean).join(", ") ||
        `${mapCenter.lat.toFixed(6)}, ${mapCenter.lng.toFixed(6)}`;

      const details: DestinationAddress = {
        placeId: `map:${mapCenter.lat.toFixed(6)},${mapCenter.lng.toFixed(6)}`,
        latitude: mapCenter.lat,
        longitude: mapCenter.lng,
        label: resolved.label || "Local selecionado no mapa",
        ...(resolved.subLabel ? { subLabel: resolved.subLabel } : {}),
        formattedAddress,
        name: resolved.label || "Local selecionado no mapa",
        components: {
          ...(resolved.components?.rua ? { rua: resolved.components.rua } : {}),
          ...(resolved.components?.numero ? { numero: resolved.components.numero } : {}),
          ...(resolved.components?.bairro ? { bairro: resolved.components.bairro } : {}),
          ...(resolved.components?.cidade ? { cidade: resolved.components.cidade } : {}),
          ...(resolved.components?.estado ? { estado: resolved.components.estado } : {}),
          ...(resolved.components?.estadoSigla
            ? { estadoSigla: resolved.components.estadoSigla }
            : {}),
          ...(resolved.components?.pais ? { pais: resolved.components.pais } : {}),
        },
        types: ["map_selection"],
        selectedAt: new Date().toISOString(),
        source: "map",
      };

      addToHistory(details);
      handleFinalSelection(details);
    } catch (geocodeError: unknown) {
      const message = readErrorMessage(
        geocodeError,
        "Não foi possível identificar esse ponto. Mova o mapa um pouco e tente novamente.",
      );
      setMapSelectionError(message);
      toast.error(message);
    } finally {
      setIsResolvingMap(false);
    }
  };

  const getFavoriteIcon = (iconName?: FavoriteIconType) => {
    if (iconName === "home") return <Home className="h-5 w-5 text-apois-yellow" />;
    if (iconName === "briefcase") return <Briefcase className="h-5 w-5 text-apois-yellow" />;
    return <Heart className="h-5 w-5 text-apois-yellow" />;
  };

  const showSearchFailure = [
    "failed",
    "network_error",
    "rate_limited",
    "configuration_missing",
  ].includes(status);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#171a21]">
      <div className="absolute inset-0">
        <PassengerMap
          origin={location ? { lat: location.latitude, lng: location.longitude } : undefined}
          destination={undefined}
          encodedPolyline={undefined}
          driverLocation={undefined}
          isStatic={!isPickingOnMap}
          selectionMode={isPickingOnMap}
          onCenterChange={setMapCenter}
        />
      </div>

      <AnimatePresence>
        {isPickingOnMap ? (
          <motion.div
            key="map-picker-controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-40"
          >
            <div className="app-safe-top app-safe-x pointer-events-auto pt-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/85 p-2 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={closeMapPicker}
                  disabled={isResolvingMap}
                  className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/8 text-white disabled:opacity-50"
                  aria-label="Voltar para a busca"
                >
                  <ArrowLeft size={21} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white">
                    {isStopSelection ? "Escolha a parada no mapa" : "Escolha o destino no mapa"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Arraste o mapa e posicione o marcador no local exato.
                  </p>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="flex flex-col items-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-black bg-apois-yellow text-black shadow-2xl">
                  <MapPin size={27} strokeWidth={2.8} />
                </div>
                <div className="h-5 w-1 rounded-full bg-black" />
                <div className="h-2 w-6 rounded-full bg-black/35 blur-[2px]" />
              </motion.div>
            </div>

            <div className="app-safe-bottom app-safe-x pointer-events-auto absolute inset-x-0 bottom-0 pb-4">
              <div className="rounded-3xl border border-white/8 bg-black/90 p-4 shadow-2xl backdrop-blur-xl">
                {mapSelectionError ? (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-apois-danger/20 bg-apois-danger/10 p-3 text-xs leading-5 text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-apois-danger" />
                    {mapSelectionError}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleConfirmMapSelection()}
                  disabled={!mapCenter || isResolvingMap}
                  className="app-pressable app-gold-glow flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-5 font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
                >
                  {isResolvingMap ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  )}
                  {isResolvingMap
                    ? "Identificando endereço..."
                    : isStopSelection
                      ? "Confirmar parada"
                      : "Confirmar destino"}
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <BottomSheet
        isOpen={isBottomSheetOpen}
        onClose={handleClose}
        preventClose={isSelecting || isResolvingMap}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="sticky top-0 z-30 bg-[#1a1a1a] pb-4 pt-2">
            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Voltar"
                className="app-pressable -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-black tracking-tight text-white">
                  {isStopSelection ? "Adicionar parada" : "Para onde vamos?"}
                </h1>
                {pendingFavoriteIcon ? (
                  <p className="mt-0.5 text-[11px] font-bold text-apois-yellow">
                    O endereço escolhido será salvo como {pendingFavoriteIcon === "home" ? "Casa" : "Trabalho"}.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4 rounded-xl border border-white/6 bg-[#282a30] px-4 py-3">
                <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-apois-success shadow-[0_0_8px_rgba(41,201,111,0.5)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Ponto de partida
                  </p>
                  <p className="truncate text-sm font-medium text-zinc-300">
                    {pickupLabel || "Identificando sua localização..."}
                  </p>
                </div>
              </div>

              <div className="relative flex items-center">
                <div className="absolute left-4 z-10">
                  {isLoading || isSelecting ? (
                    <Loader2 className="h-5 w-5 animate-spin text-apois-yellow" />
                  ) : (
                    <Search className="h-5 w-5 text-apois-yellow" />
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={isStopSelection ? "Onde deseja parar?" : "Digite seu destino"}
                  autoComplete="off"
                  enterKeyHint="search"
                  className="h-14 w-full rounded-xl border-2 border-apois-yellow/25 bg-[#282a30] pl-12 pr-12 text-base font-semibold text-white outline-none transition-all placeholder:text-zinc-500 focus:border-apois-yellow"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={clearQuery}
                    className="app-pressable absolute right-3 flex h-9 w-9 items-center justify-center rounded-full text-zinc-400"
                    aria-label="Limpar busca"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="app-scroll mt-2 min-h-0 flex-1 pb-4">
            <AnimatePresence mode="wait">
              {query.trim().length < 2 ? (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {!isStopSelection ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleQuickAction("home")}
                        className="app-pressable flex items-center gap-3 rounded-2xl border border-white/7 bg-[#282a30] p-3 text-left"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-apois-yellow/10 text-apois-yellow">
                          <Home size={19} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-white">Casa</span>
                          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                            {homeFavorite ? homeFavorite.label : "Adicionar"}
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQuickAction("briefcase")}
                        className="app-pressable flex items-center gap-3 rounded-2xl border border-white/7 bg-[#282a30] p-3 text-left"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-apois-yellow/10 text-apois-yellow">
                          <Briefcase size={19} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-white">Trabalho</span>
                          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                            {workFavorite ? workFavorite.label : "Adicionar"}
                          </span>
                        </span>
                      </button>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={openMapPicker}
                    className="app-pressable flex w-full items-center gap-4 rounded-2xl border border-apois-yellow/15 bg-apois-yellow/8 p-4 text-left"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apois-yellow/12 text-apois-yellow">
                      <MapIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-white">Escolher no mapa</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">Marque o ponto exato arrastando o mapa.</span>
                    </span>
                  </button>

                  {favorites.length > 0 ? (
                    <section>
                      <h2 className="mb-2 px-1 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        Favoritos
                      </h2>
                      <div className="space-y-1">
                        {[homeFavorite, workFavorite, ...otherFavorites]
                          .filter((item): item is DestinationHistoryItem => Boolean(item))
                          .map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectHistoryItem(item)}
                              className="app-pressable flex w-full items-center gap-4 rounded-xl p-3 text-left active:bg-white/5"
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#282a30]">
                                {getFavoriteIcon(item.icon)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-white">
                                  {item.nickname || item.label}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-zinc-500">
                                  {item.formattedAddress}
                                </span>
                              </span>
                            </button>
                          ))}
                      </div>
                    </section>
                  ) : (
                    <section className="rounded-2xl border border-dashed border-white/8 px-4 py-5 text-center">
                      <Heart className="mx-auto h-6 w-6 text-zinc-700" />
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        Seus endereços favoritos aparecerão aqui.
                      </p>
                    </section>
                  )}

                  {recent.length > 0 ? (
                    <section>
                      <div className="mb-2 flex items-center justify-between px-1">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                          Recentes
                        </h2>
                        <button
                          type="button"
                          onClick={() => void clearAllRecent()}
                          className="app-pressable flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-500"
                        >
                          <Trash2 size={12} />
                          Limpar
                        </button>
                      </div>
                      <div className="space-y-1">
                        {recent.map((item) => (
                          <button
                            key={item.id || item.placeId}
                            type="button"
                            onClick={() => handleSelectHistoryItem(item)}
                            className="app-pressable flex w-full items-center gap-4 rounded-xl p-3 text-left active:bg-white/5"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#282a30] text-zinc-500">
                              <Clock className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-white">{item.label}</span>
                              <span className="mt-0.5 block truncate text-xs text-zinc-500">{item.formattedAddress}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-1"
                >
                  {status === "debouncing" || status === "loading" ? (
                    <div className="flex flex-col items-center gap-3 py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-apois-yellow" />
                      <p className="text-sm text-zinc-500">Buscando endereços...</p>
                    </div>
                  ) : null}

                  {status === "empty" ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <AlertCircle className="h-8 w-8 text-zinc-700" />
                      <p className="text-sm font-bold text-zinc-400">Nenhum endereço encontrado.</p>
                      <p className="max-w-xs text-xs leading-5 text-zinc-600">Tente informar rua, número, bairro ou um ponto conhecido.</p>
                    </div>
                  ) : null}

                  {showSearchFailure ? (
                    <div className="flex flex-col items-center gap-4 py-12 text-center">
                      <AlertCircle className="h-8 w-8 text-apois-danger" />
                      <div>
                        <p className="text-sm font-bold text-red-300">Não foi possível pesquisar agora.</p>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">
                          {error?.message || "Verifique a conexão e tente novamente."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={retry}
                        className="app-pressable min-h-11 rounded-xl border border-apois-danger/25 bg-apois-danger/10 px-5 text-xs font-black text-red-300"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : null}

                  {status === "success"
                    ? suggestions.map((suggestion) => (
                        <button
                          key={suggestion.placeId}
                          type="button"
                          onClick={() => void handleSelectSuggestion(suggestion)}
                          disabled={isSelecting}
                          className="app-pressable flex w-full items-center gap-4 border-b border-white/5 p-4 text-left disabled:opacity-50"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow">
                            <MapPin className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-white">{suggestion.primaryText}</span>
                            <span className="mt-0.5 block truncate text-xs text-zinc-500">{suggestion.secondaryText}</span>
                          </span>
                        </button>
                      ))
                    : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
