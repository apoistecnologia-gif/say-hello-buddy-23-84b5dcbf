import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  MapPin, 
  Search, 
  X,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import PassengerMap from "@/components/map/PassengerMap";
import { useRoute } from "@/hooks/use-route";
import { useRideRequest } from "@/hooks/rides/use-ride-request";
import { rideRequestService } from "@/services/rides/ride-request-service";

export const Route = createFileRoute("/corrida/$rideId")({
  component: ActiveRidePage,
});

function ActiveRidePage() {
  const { rideId } = Route.useParams();
  const navigate = useNavigate();
  const { route } = useRoute();
  const { officialEstimatedPrice } = useRideRequest();
  
  const [rideData, setRideData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    const fetchRide = async () => {
      try {
        const { data, error } = await supabase
          .from("rides")
          .select("*")
          .eq("id", rideId)
          .single();

        if (error) throw error;
        setRideData(data);
      } catch (err) {
        console.error("Error fetching ride:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRide();

    const channel = supabase
      .channel(`ride_${rideId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        (payload) => {
          setRideData(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rideId]);

  const handleCancel = async () => {
    try {
      setIsCanceling(true);
      const res = await rideRequestService.cancelRide(rideId);
      if (res.ok) {
        navigate({ to: "/inicio" });
      }
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setIsCanceling(false);
      setShowCancelConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4">
        <Loader2 className="animate-spin text-apois-yellow" size={40} />
        <p className="text-zinc-400 font-bold">Carregando detalhes da corrida...</p>
      </div>
    );
  }

  const status = rideData?.status || "procurar_motorista";

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      {/* Map Area */}
      <div className="flex-1 relative min-h-[40vh]">
        <PassengerMap />
        
        {/* Overlays */}
        <div className="absolute top-safe left-5 right-5 z-20 flex justify-between">
           <Button 
            variant="secondary" 
            size="icon" 
            onClick={() => navigate({ to: "/inicio" })}
            className="rounded-full bg-black/50 backdrop-blur-md border border-white/10"
           >
             <ChevronLeft size={24} />
           </Button>
        </div>
      </div>

      {/* Ride Info Sheet */}
      <div className="bg-[#1e1e1e]/95 backdrop-blur-xl border-t border-white/5 rounded-t-3xl -mt-6 relative z-30 pb-safe">
        <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto my-4" />
        
        <div className="px-6 space-y-6">
          {status === "procurar_motorista" && (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-apois-yellow/20 flex items-center justify-center">
                  <Search className="text-apois-yellow animate-pulse" size={32} />
                </div>
                <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-t-apois-yellow border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              </div>
              
              <div>
                <h2 className="text-xl font-black">Procurando motoristas...</h2>
                <p className="text-sm text-zinc-500 mt-1">Isso pode levar alguns instantes</p>
              </div>
            </div>
          )}

          <div className="space-y-4 py-4 border-y border-white/5">
            <div className="flex items-center justify-between">
               <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Categoria</p>
                 <p className="text-base font-bold text-apois-yellow capitalize">{rideData?.category}</p>
               </div>
               <div className="text-right">
                 <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Preço Confirmado</p>
                 <p className="text-xl font-black text-white">
                   {formatCurrency(rideData?.estimated_price || officialEstimatedPrice || 0)}
                 </p>
               </div>
            </div>

            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                <div className="w-2 h-2 rounded-full bg-apois-yellow shrink-0" />
                <p className="text-xs text-zinc-300 line-clamp-1">{rideData?.origin_name || "Origem"}</p>
              </div>
              <div className="flex gap-3 items-center">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <p className="text-xs text-zinc-300 line-clamp-1">{rideData?.destination_name || "Destino"}</p>
              </div>
            </div>
          </div>

          <div className="pb-8">
            <Button
              variant="destructive"
              className="w-full h-14 rounded-2xl bg-zinc-900 border border-white/5 text-zinc-400 font-bold"
              onClick={() => setShowCancelConfirm(true)}
              disabled={isCanceling}
            >
              Cancelar Corrida
            </Button>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog (Simplified) */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 rounded-3xl p-6 border border-white/10 w-full max-w-sm space-y-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                <AlertCircle className="text-red-500" size={32} />
              </div>
              <div>
                <h3 className="text-xl font-black">Cancelar busca?</h3>
                <p className="text-sm text-zinc-400 mt-2">Você deseja realmente cancelar sua solicitação de corrida?</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 h-12 rounded-xl"
                onClick={() => setShowCancelConfirm(false)}
              >
                Voltar
              </Button>
              <Button 
                variant="destructive" 
                className="flex-1 h-12 rounded-xl bg-red-600"
                onClick={handleCancel}
                disabled={isCanceling}
              >
                {isCanceling ? <Loader2 className="animate-spin" /> : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
