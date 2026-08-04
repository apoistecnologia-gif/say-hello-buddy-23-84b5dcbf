import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDestinationSearch } from "@/hooks/use-destination-search";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
import { useDestinationHistory } from "@/hooks/use-destination-history";
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
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlaceSuggestion, DestinationAddress } from "@/types/places";
import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/buscar-destino")({
  component: BuscarDestinoPage,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { address: origin } = usePickupAddress();
  const { setDestination } = useDestination();
  const { 
    recent, 
    favorites, 
    addToHistory, 
    removeRecent, 
    addFavorite, 
    removeFavorite,
    clearAllRecent 
  } = useDestinationHistory();
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
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

  const handleSelectHistoryItem = (item: DestinationAddress) => {
    addToHistory(item); // Update recent order
    setDestination(item);
    handleClose();
  };

  const handleQuickAction = async (type: 'home' | 'briefcase') => {
    const existing = favorites.find(f => f.icon === type);
    if (existing) {
      handleSelectHistoryItem(existing as DestinationAddress);
    } else {
      toast.info(`Busque o endereço para definir sua ${type === 'home' ? 'Casa' : 'Trabalho'}.`);
      inputRef.current?.focus();
    }
  };

  const getFavoriteIcon = (iconName?: string) => {
    switch (iconName) {
      case 'home': return <Home className="w-5 h-5 text-blue-400" />;
      case 'briefcase': return <Briefcase className="w-5 h-5 text-orange-400" />;
      default: return <Heart className="w-5 h-5 text-red-400" />;
    }
  };

  const homeFav = favorites.find(f => f.icon === 'home');
  const workFav = favorites.find(f => f.icon === 'briefcase');
  const otherFavs = favorites.filter(f => f.icon !== 'home' && f.icon !== 'briefcase');

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
                    {pickupLabel || 'Buscando sua localização...'}
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
                    <button 
                      onClick={() => handleQuickAction('home')}
                      className="flex flex-col items-center gap-2 min-w-[80px] group"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                        homeFav ? 'bg-[#2a2a2a]' : 'bg-[#2a2a2a] border border-dashed border-gray-700'
                      }`}>
                        <Home className={`w-6 h-6 ${homeFav ? 'text-blue-400' : 'text-gray-600'}`} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {homeFav ? 'Casa' : 'Add Casa'}
                      </span>
                    </button>
                    
                    <button 
                      onClick={() => handleQuickAction('briefcase')}
                      className="flex flex-col items-center gap-2 min-w-[80px] group"
                    >
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                        workFav ? 'bg-[#2a2a2a]' : 'bg-[#2a2a2a] border border-dashed border-gray-700'
                      }`}>
                        <Briefcase className={`w-6 h-6 ${workFav ? 'text-orange-400' : 'text-gray-600'}`} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {workFav ? 'Trampo' : 'Add Trampo'}
                      </span>
                    </button>

                    <button className="flex flex-col items-center gap-2 min-w-[80px] group opacity-40">
                      <div className="w-14 h-14 rounded-full bg-[#2a2a2a] border border-dashed border-gray-700 flex items-center justify-center transition-transform active:scale-90">
                        <Plus className="w-6 h-6 text-gray-600" />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Novo</span>
                    </button>
                  </div>

                  {/* Lista de Favoritos Personalizados */}
                  {otherFavs.length > 0 && (
                    <section>
                      <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] px-1 mb-3">Favoritos</h2>
                      <div className="space-y-1">
                        {otherFavs.map((fav) => (
                          <div key={fav.id} className="group relative">
                            <button
                              onClick={() => handleSelectHistoryItem(fav as DestinationAddress)}
                              className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 transition-colors text-left"
                            >
                              <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                                {getFavoriteIcon(fav.icon)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{fav.nickname || fav.label}</p>
                                <p className="text-[11px] text-gray-500 truncate leading-relaxed">{fav.formattedAddress}</p>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Lista de Recentes */}
                  <section>
                    <div className="flex items-center justify-between px-1 mb-3">
                      <h2 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">Recentes</h2>
                      {recent.length > 0 && (
                        <button 
                          onClick={() => setShowClearConfirm(true)}
                          className="text-[10px] font-bold text-yellow-500/70 active:text-yellow-500 uppercase tracking-wider"
                        >
                          Limpar tudo
                        </button>
                      )}
                    </div>
                    
                    {recent.length > 0 ? (
                      <div className="space-y-1">
                        {recent.map((item) => (
                          <div key={item.id} className="group relative">
                            <button
                              onClick={() => handleSelectHistoryItem(item as DestinationAddress)}
                              className="w-full flex items-center gap-4 p-3 rounded-xl active:bg-white/5 transition-colors text-left pr-12"
                            >
                              <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
                                <Clock className="w-5 h-5 text-gray-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{item.label}</p>
                                <p className="text-[11px] text-gray-500 truncate leading-relaxed">{item.formattedAddress}</p>
                              </div>
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRecent(item.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 text-gray-600 active:text-red-500"
                              aria-label="Remover recente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-[#222]/30 rounded-2xl border border-dashed border-gray-800/50">
                        <p className="text-gray-600 text-xs font-medium">Seus destinos recentes aparecerão aqui.</p>
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
                      <p className="text-gray-500 font-medium">Nenhum resultado encontrado.</p>
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

                  <div className="divide-y divide-gray-800/30">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.placeId}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        disabled={isSelecting}
                        className="w-full flex items-start gap-4 p-4 active:bg-white/5 transition-colors disabled:opacity-50 text-left ripple-effect"
                      >
                        <div className="mt-1 shrink-0">
                          <MapPin className="w-5 h-5 text-yellow-500/50" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-white truncate leading-tight">
                            {suggestion.primaryText}
                          </p>
                          {suggestion.secondaryText && (
                            <p className="text-xs text-gray-500 truncate mt-1">
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

      {/* Confirmação de Limpar Recentes */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowClearConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-[#1a1a1a] rounded-[32px] p-8 border border-white/5 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Limpar Histórico?</h3>
              <p className="text-gray-400 mb-8 leading-relaxed">Iso apagará todos os seus destinos recentes permanentemente.</p>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowClearConfirm(false)}
                  className="rounded-2xl h-14 font-bold border-gray-800 text-gray-400"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={async () => {
                    await clearAllRecent();
                    setShowClearConfirm(false);
                    toast.success("Histórico limpo com sucesso.");
                  }}
                  className="rounded-2xl h-14 font-black bg-red-600 hover:bg-red-700 text-white"
                >
                  Limpar
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
