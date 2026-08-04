import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useDestinationSearch } from "@/hooks/use-destination-search";
import { useDestination } from "@/hooks/use-destination";
import { usePickupAddress } from "@/hooks/use-pickup-address";
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
  Navigation,
  Building2,
  Home,
  Briefcase
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlaceSuggestion } from "@/types/places";

export const Route = createFileRoute("/buscar-destino")({
  component: BuscarDestinoPage,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { address: origin } = usePickupAddress();
  const { setDestination } = useDestination();
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  const handleGoBack = () => {
    reset();
    window.history.back();
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    if (isSelecting) return;
    
    setIsSelecting(true);
    try {
      const details = await placesService.getPlaceDetails(suggestion.placeId);
      setDestination(details);
      placesService.resetSessionToken();
      navigate({ to: "/inicio" });
    } catch (err: any) {
      toast.error(err.message || "Não foi possível carregar os detalhes deste local.");
    } finally {
      setIsSelecting(false);
    }
  };

  const getIconForType = (types: string[]) => {
    if (types.includes('airport')) return <Navigation className="w-5 h-5 text-gray-400" />;
    if (types.includes('bus_station') || types.includes('train_station')) return <Navigation className="w-5 h-5 text-gray-400" />;
    if (types.includes('establishment')) return <Building2 className="w-5 h-5 text-gray-400" />;
    return <MapPin className="w-5 h-5 text-gray-400" />;
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      {/* Header with Search Box */}
      <div className="p-4 pt-8 bg-[#1a1a1a] shadow-lg sticky top-0 z-20">
        <div className="flex items-center gap-3 mb-6">
          <button 
            onClick={handleGoBack}
            className="p-2 -ml-2 text-white active:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold">Para onde vamos?</h1>
        </div>

        <div className="space-y-3">
          {/* Static Origin Display */}
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
              placeholder="Digite o destino..."
              className="w-full h-14 pl-12 pr-12 bg-[#2a2a2a] border-2 border-yellow-500/30 focus:border-yellow-500 outline-none rounded-xl text-lg font-medium placeholder:text-gray-500 transition-all"
            />
            {query && (
              <button 
                onClick={clearQuery}
                className="absolute right-4 p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto pb-8">
        {status === 'idle' && (
          <div className="p-8 text-center">
            <Search className="w-12 h-12 text-gray-800 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Digite um endereço ou nome de local para buscar.</p>
          </div>
        )}

        {status === 'below_minimum' && (
          <div className="p-8 text-center">
            <p className="text-gray-500">Continue digitando para ver sugestões...</p>
          </div>
        )}

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
              className="w-full flex items-start gap-4 p-4 active:bg-white/5 transition-colors disabled:opacity-50 text-left"
            >
              <div className="mt-1">
                {getIconForType(suggestion.types)}
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
      </div>
    </div>
  );
}
