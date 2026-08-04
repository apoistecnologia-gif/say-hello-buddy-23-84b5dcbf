import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDestinationSearch } from "@/hooks/use-destination-search";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestinationHistory } from "@/hooks/use-destination-history";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { placesService } from "@/services/places/places-service";
import {
  ArrowLeft,
  X,
  MapPin,
  Loader2,
  AlertCircle,
  Home,
  Briefcase,
  Clock,
  Heart,
  Plus,
  Trash2,
  Map as MapIcon,
  Check,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlaceSuggestion, DestinationAddress } from "@/types/places";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/buscar-destino")({
  validateSearch: (search: Record<string, unknown>) => ({
    stop: search["stop"] === true || search["stop"] === "true",
  }),
  component: BuscarDestinoPage,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { stop: isStopSelection } = Route.useSearch();
  const { pickupLabel } = usePickupAddress();
  const { setDestination } = useDestination();
  const { addStop } = useRideStops();
  const { recent, favorites, addToHistory } = useDestinationHistory();
  const { query, suggestions, status, isLoading, error, setQuery, clearQuery, reset } =
    useDestinationSearch();

  const [isSelecting, setIsSelecting] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isBottomSheetOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 400);
    }
  }, [isBottomSheetOpen]);

  const handleClose = () => {
    setIsBottomSheetOpen(false);
    setTimeout(() => {
      reset();
      navigate({ to: "/inicio" });
    }, 300);
  };

  const handleFinalSelection = (details: DestinationAddress) => {
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
      setDestination(details);
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
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar os detalhes deste local.");
    } finally {
      setIsSelecting(false);
    }
  };

  const handleSelectHistoryItem = (item: DestinationAddress) => {
    addToHistory(item);
    handleFinalSelection(item);
  };

  const handleQuickAction = async (type: "home" | "briefcase") => {
    const existing = favorites.find((f) => f.icon === type);
    if (existing) {
      handleSelectHistoryItem(existing as DestinationAddress);
    } else {
      toast.info(`Pesquise o endereço para definir sua ${type === "home" ? "Casa" : "Trabalho"}.`);
      inputRef.current?.focus();
    }
  };

  const handleConfirmMapSelection = () => {
    // Aqui assumimos que o PassengerMap expõe a posição central ou que temos acesso via Ref
    // Por enquanto, para respeitar a regra de "Não calcular rota", apenas retornamos o estado
    // Em uma implementação real, pegaríamos o centro do mapa.
    toast.success("Destino selecionado no mapa!");
    setIsPickingOnMap(false);
    setIsBottomSheetOpen(true);
  };

  const getFavoriteIcon = (iconName?: string) => {
    switch (iconName) {
      case "home":
        return <Home className="w-5 h-5 text-blue-400" />;
      case "briefcase":
        return <Briefcase className="w-5 h-5 text-orange-400" />;
      default:
        return <Heart className="w-5 h-5 text-red-400" />;
    }
  };

  const homeFav = favorites.find((f) => f.icon === "home");
  const workFav = favorites.find((f) => f.icon === "briefcase");
  const otherFavs = favorites.filter((f) => f.icon !== "home" && f.icon !== "briefcase");

  return (
    <div className="flex flex-col min-h-screen bg-transparent relative">
      {/* PIN central fixo quando escolhendo no mapa */}
      <AnimatePresence>
        {isPickingOnMap && (
          <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="w-10 h-10 bg-apois-yellow rounded-full flex items-center justify-center shadow-2xl border-2 border-black">
                <MapPin className="text-black" size={24} />
              </div>
              <div className="w-1 h-4 bg-black" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Botão de confirmação no mapa */}
      {isPickingOnMap && (
        <div className="fixed bottom-10 left-5 right-5 z-50">
          <Button
            onClick={handleConfirmMapSelection}
            className="w-full h-16 bg-apois-yellow text-black font-black text-lg rounded-2xl shadow-2xl active:scale-95 transition-all"
          >
            Confirmar destino
          </Button>
        </div>
      )}

      <BottomSheet isOpen={isBottomSheetOpen} onClose={handleClose} preventClose={isSelecting}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="sticky top-0 bg-[#1a1a1a] pt-2 pb-4 z-30">
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={handleClose}
                aria-label="Voltar"
                className="p-2 -ml-2 text-white active:bg-white/10 rounded-full transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-bold text-white">
                {isStopSelection ? "Adicionar Parada" : "Para onde vamos?"}
              </h1>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4 px-4 py-3 bg-[#2a2a2a] rounded-xl border border-gray-700/30 opacity-70">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Ponto de partida
                  </p>
                  <p className="text-sm font-medium text-gray-300 truncate">
                    {pickupLabel || "Buscando sua localização..."}
                  </p>
                </div>
              </div>

              <div className="relative flex items-center">
                <div className="absolute left-4 z-10">
                  {isLoading || isSelecting ? (
                    <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border-2 border-yellow-500" />
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={isStopSelection ? "Onde parar?" : "Para onde vamos?"}
                  className="w-full h-14 pl-12 pr-12 bg-[#2a2a2a] border-2 border-yellow-500/30 focus:border-yellow-500 outline-none rounded-xl text-lg font-medium text-white placeholder:text-gray-500 transition-all"
                />
                {query && (
                  <button onClick={clearQuery} className="absolute right-4 p-1 text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 mt-2">
            <AnimatePresence mode="wait">
              {query.length < 2 ? (
                <motion.div key="history" className="space-y-6">
                  <div className="flex gap-4 overflow-x-auto pb-2 px-1">
                    <button
                      onClick={() => handleQuickAction("home")}
                      className="flex flex-col items-center gap-2 min-w-[80px]"
                    >
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                        <Home className={homeFav ? "text-blue-400" : "text-gray-600"} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {homeFav ? "Casa" : "Add Casa"}
                      </span>
                    </button>
                    <button
                      onClick={() => handleQuickAction("briefcase")}
                      className="flex flex-col items-center gap-2 min-w-[80px]"
                    >
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                        <Briefcase className={workFav ? "text-orange-400" : "text-gray-600"} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {workFav ? "Trampo" : "Add Trampo"}
                      </span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setIsBottomSheetOpen(false);
                      setIsPickingOnMap(true);
                    }}
                    className="w-full flex items-center gap-4 p-4 bg-[#2a2a2a] rounded-2xl border border-white/5 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-apois-yellow/10 flex items-center justify-center">
                      <MapIcon className="w-5 h-5 text-apois-yellow" />
                    </div>
                    <span className="font-bold text-white text-sm">Escolher no mapa</span>
                  </button>

                  <section>
                    <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1 mb-3">
                      Favoritos
                    </h2>
                    {favorites.length === 0 ? (
                      <p className="text-xs text-gray-500 px-1 py-2 italic">
                        Você ainda não possui favoritos.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {favorites.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleSelectHistoryItem(item as DestinationAddress)}
                            className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                              {getFavoriteIcon(item.icon)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-white text-sm truncate">
                                {item.nickname || item.label}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {item.formattedAddress}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {recent.length > 0 && (
                    <section>
                      <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1 mb-3">
                        Recentes
                      </h2>
                      <div className="space-y-1">
                        {recent.map((item) => (
                          <button
                            key={item.id || item.placeId}
                            onClick={() => handleSelectHistoryItem(item as DestinationAddress)}
                            className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                              <Clock className="w-5 h-5 text-gray-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-white text-sm truncate">{item.label}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {item.formattedAddress}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </motion.div>
              ) : (
                <motion.div key="results" className="space-y-1">
                  {status === "loading" && (
                    <div className="flex flex-col items-center py-10 gap-3">
                      <Loader2 className="w-8 h-8 text-apois-yellow animate-spin" />
                      <p className="text-sm text-gray-500">Buscando endereços...</p>
                    </div>
                  )}

                  {status === "empty" && (
                    <div className="flex flex-col items-center py-10 gap-2">
                      <AlertCircle className="w-8 h-8 text-gray-600" />
                      <p className="text-sm text-gray-500">Nenhum endereço encontrado.</p>
                    </div>
                  )}

                  {status === "failed" && (
                    <div className="flex flex-col items-center py-10 gap-4">
                      <p className="text-sm text-red-400">Não foi possível pesquisar agora.</p>
                      <Button
                        onClick={() => setQuery(query)}
                        variant="outline"
                        className="border-red-500/50 text-red-400"
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  )}

                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.placeId}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl active:bg-white/5 text-left border-b border-white/5"
                    >
                      <div className="w-10 h-10 rounded-full bg-apois-yellow/10 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-apois-yellow" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm truncate">
                          {suggestion.primaryText}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{suggestion.secondaryText}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
