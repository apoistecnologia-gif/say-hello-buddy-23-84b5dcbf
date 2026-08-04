import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDestinationSearch } from "@/hooks/use-destination-search";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestinationHistory } from "@/hooks/use-destination-history";
import { placesService } from "@/services/places/places-service";
import { 
  ArrowLeft, 
  Search, 
  X, 
  MapPin, 
  History, 
  Star, 
  Loader2, 
  AlertCircle,
  Home,
  Briefcase,
  Clock,
  Heart,
  Plus,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlaceSuggestion } from "@/types/places";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/buscar-destino")({
  component: BuscarDestinoPage,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { address: origin } = usePickupAddress();
  const { setDestination } = useDestination();
  const { recent, favorites, addToHistory, removeRecent, toggleFavorite } = useDestinationHistory();
  const {
    query,
    suggestions,
    status,
    isLoading,
    error,
    setQuery,
    clearQuery,
    reset
  } = useDestinationSearch();

  const [isSelecting, setIsSelecting] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isBottomSheetOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 400); // Aguarda animação da bottom sheet
    }
  }, [isBottomSheetOpen]);

  const handleClose = () => {
    setIsBottomSheetOpen(false);
    setTimeout(() => {
      reset();
      navigate({ to: "/inicio" });
    }, 300);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (isSelecting) return;
    
    setIsSelecting(true);
    try {
      const details = await placesService.selectPrediction(suggestion);
      addToHistory(details);
      setDestination(details);
      handleClose();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar os detalhes deste local.");
    } finally {
      setIsSelecting(false);
    }
  };

  const handleSelectHistoryItem = (item: any) => {
    setDestination(item);
    handleClose();
  };

  const getFavoriteIcon = (iconName?: string) => {
    switch (iconName) {
      case 'home': return <Home className="w-5 h-5 text-blue-400" />;
      case 'briefcase': return <Briefcase className="w-5 h-5 text-orange-400" />;
      default: return <Heart className="w-5 h-5 text-red-400" />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-transparent">
      <BottomSheet 
        isOpen={isBottomSheetOpen} 
        onClose={handleClose}
        preventClose={isSelecting}
      >
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
              <h1 className="text-xl font-bold text-white">Para onde vamos?</h1>
            </div>

            <div className="space-y-3">
              {/* Origin Display */}
              <div className="flex items-center gap-4 px-4 py-3 bg-[#2a2a2a] rounded-xl border border-gray-700/30 opacity-70">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Ponto de partida</p>
                  <p className="text-sm font-medium text-gray-300 truncate">
                    {origin?.label || 'Buscando sua localização...'}
                  </p>
                </div>
              </div>

              {/* Search Input */}
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
                  placeholder="Para onde vamos?"
                  aria-label="Campo de busca de destino"
                  className="w-full h-14 pl-12 pr-12 bg-[#2a2a2a] border-2 border-yellow-500/30 focus:border-yellow-500 outline-none rounded-xl text-lg font-medium text-white placeholder:text-gray-500 transition-all"
                />
                {query && (
                  <button 
                    onClick={clearQuery}
                    aria-label="Limpar busca"
                    className="absolute right-4 p-1 text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 mt-2">
            <AnimatePresence mode="wait">
              {query.length < 3 ? (
                <motion.div 
                  key="history"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Favoritos Rápidos */}
                  <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide px-1">
                    <button className="flex flex-col items-center gap-2 min-w-[72px] group">
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] flex items-center justify-center group-active:scale-90 transition-transform">
                        <Home className="w-6 h-6 text-blue-400" />
                      </div>
                      <span className="text-xs font-medium text-gray-400">Casa</span>
                    </button>
                    <button className="flex flex-col items-center gap-2 min-w-[72px] group">
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] flex items-center justify-center group-active:scale-90 transition-transform">
                        <Briefcase className="w-6 h-6 text-orange-400" />
                      </div>
                      <span className="text-xs font-medium text-gray-400">Trabalho</span>
                    </button>
                    <button className="flex flex-col items-center gap-2 min-w-[72px] group">
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] border border-dashed border-gray-700 flex items-center justify-center group-active:scale-90 transition-transform">
                        <Plus className="w-6 h-6 text-gray-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-400">Novo</span>
                    </button>
                  </div>

                  {/* Lista de Favoritos */}
                  {favorites.length > 0 && (
                    <section>
                      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">Favoritos</h2>
                      <div className="space-y-1">
                        {favorites.map((fav) => (
                          <button
                            key={fav.id}
                            onClick={() => handleSelectHistoryItem(fav)}
                            className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 transition-colors text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                              {getFavoriteIcon(fav.icon)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{fav.nickname || fav.label}</p>
                              <p className="text-xs text-gray-500 truncate">{fav.formattedAddress}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Lista de Recentes */}
                  <section>
                    <div className="flex items-center justify-between px-1 mb-3">
                      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Recentes</h2>
                    </div>
                    {recent.length > 0 ? (
                      <div className="space-y-1">
                        {recent.map((item) => (
                          <div key={item.id} className="group relative">
                            <button
                              onClick={() => handleSelectHistoryItem(item)}
                              className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 transition-colors text-left"
                            >
                              <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                                <Clock className="w-5 h-5 text-gray-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{item.label}</p>
                                <p className="text-xs text-gray-500 truncate">{item.formattedAddress}</p>
                              </div>
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRecent(item.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 text-gray-700 active:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-[#222] rounded-2xl border border-dashed border-gray-800">
                        <p className="text-gray-500 text-sm">Seus destinos recentes aparecerão aqui para acesso rápido.</p>
                      </div>
                    )}
                  </section>
                </motion.div>
              ) : (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-1"
                >
                  {status === 'empty' && (
                    <div className="p-8 text-center">
                      <AlertCircle className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">Nenhum resultado encontrado para "{query}".</p>
                    </div>
                  )}

                  {error && (
                    <div className="p-8 text-center">
                      <AlertCircle className="w-12 h-12 text-red-900/50 mx-auto mb-4" />
                      <p className="text-red-400 font-medium mb-2">{error.message}</p>
                      <button 
                        onClick={() => setQuery(query)}
                        className="text-yellow-500 font-bold"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )}

                  <div className="divide-y divide-gray-800/50">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.placeId}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        disabled={isSelecting}
                        className="w-full flex items-start gap-4 p-4 active:bg-white/5 transition-colors disabled:opacity-50 text-left ripple-effect"
                      >
                        <div className="mt-1">
                          <MapPin className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-white truncate leading-tight">
                            {suggestion.primaryText}
                          </p>
                          {suggestion.secondaryText && (
                            <p className="text-sm text-gray-500 truncate mt-0.5">
                              {suggestion.secondaryText}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}