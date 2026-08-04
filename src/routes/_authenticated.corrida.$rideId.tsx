import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import PassengerMap from "@/components/map/PassengerMap";
import { RideStatusHeader } from "@/components/rides/active/RideStatusHeader";
import { DriverCard } from "@/components/rides/active/DriverCard";
import { VehicleCard } from "@/components/rides/active/VehicleCard";
import { SecurityCodeCard } from "@/components/rides/active/SecurityCodeCard";
import { RideStopsTimeline } from "@/components/rides/active/RideStopsTimeline";
import { CancellationDialog } from "@/components/rides/active/CancellationDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Share2, Shield, X, Search, Home } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/corrida/$rideId")({
  component: ActiveRidePage,
});

function ActiveRidePage() {
  const { rideId } = useParams({ from: "/corrida/$rideId" });
  const navigate = useNavigate();
  const { 
    ride, 
    status, 
    screenState, 
    isRefreshing, 
    loadRide, 
    actionAvailability,
    clearRide 
  } = useActiveRide();
  
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  useEffect(() => {
    if (rideId) {
      loadRide(rideId);
    }
  }, [rideId, loadRide]);

  const handleBack = () => {
    if (screenState === 'completed' || screenState === 'cancelled') {
      clearRide();
      navigate({ to: "/inicio" });
    } else {
      navigate({ to: "/inicio" });
    }
  };

  const handleReturnHome = () => {
    clearRide();
    navigate({ to: "/inicio" });
  };

  if (screenState === 'loading' || screenState === 'idle') {
    return (
      <div className="flex flex-col h-[100dvh] bg-black p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-full bg-zinc-900" />
          <Skeleton className="h-6 w-32 bg-zinc-900" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl bg-zinc-900" />
        <Skeleton className="flex-1 w-full rounded-3xl bg-zinc-900" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl bg-zinc-900" />
          <Skeleton className="h-16 w-full rounded-2xl bg-zinc-900" />
        </div>
      </div>
    );
  }

  if (screenState === 'not_found' || screenState === 'unauthorized' || screenState === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-black p-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center">
          <X className="text-zinc-600" size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Ops! Algo deu errado</h2>
          <p className="text-zinc-500 text-sm font-medium">
            {screenState === 'not_found' ? 'Esta corrida não foi encontrada.' : 
             screenState === 'unauthorized' ? 'Você não tem permissão para ver esta corrida.' : 
             'Não conseguimos carregar os dados no momento.'}
          </p>
        </div>
        <Button 
          onClick={handleReturnHome}
          className="bg-apois-yellow text-black font-black w-full h-12 rounded-2xl"
        >
          Voltar para o Início
        </Button>
      </div>
    );
  }

  if (!ride || !status) return null;

  return (
    <div className="flex flex-col h-[100dvh] bg-black relative overflow-hidden">
      {/* Header Actions */}
      <div className="absolute top-6 left-6 right-6 z-20 flex justify-between items-center pointer-events-none">
        <button 
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center pointer-events-auto active:scale-95 transition-transform"
        >
          <ChevronLeft className="text-white" size={20} />
        </button>

        <div className="flex gap-3 pointer-events-auto">
          {actionAvailability?.canShareRide && (
            <button className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-transform">
              <Share2 className="text-white" size={18} />
            </button>
          )}
          {actionAvailability?.canOpenSafety && (
            <button className="w-10 h-10 rounded-full bg-red-500/80 backdrop-blur-md border border-red-500/20 flex items-center justify-center active:scale-95 transition-transform">
              <Shield className="text-white" size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Map View */}
      <div className="flex-1 relative">
        <PassengerMap 
          origin={ride.origin}
          destination={ride.destination}
          encodedPolyline={ride.encoded_polyline || undefined}
          driverLocation={ride.driver_latitude && ride.driver_longitude ? {
            lat: ride.driver_latitude,
            lng: ride.driver_longitude,
            heading: ride.driver_heading || 0
          } : undefined}
          isStatic={screenState === 'completed' || screenState === 'cancelled'}
        />
        
        {/* Status Overlay */}
        <div className="absolute top-20 left-6 right-6 z-10">
          <RideStatusHeader status={status} isRefreshing={isRefreshing} />
        </div>
      </div>

      {/* Info Panel */}
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-zinc-950 border-t border-white/5 rounded-t-[32px] px-6 pt-6 pb-8 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide shadow-[0_-8px_32px_rgba(0,0,0,0.5)]"
      >
        <AnimatePresence mode="wait">
          <motion.div 
            key={status}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Driver & Vehicle */}
            {(status !== 'procurar_motorista' && status !== 'agendada') && (
              <>
                <DriverCard ride={ride} />
                <VehicleCard ride={ride} />
                {status === 'motorista_a_caminho' && <SecurityCodeCard code={ride.security_code || undefined} />}
              </>
            )}

            {/* Waiting for Driver State */}
            {status === 'procurar_motorista' && (
              <div className="bg-zinc-900/50 rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-2 border-apois-yellow/20 border-t-apois-yellow animate-spin" />
                  <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-apois-yellow" size={24} />
                </div>
                <div>
                  <h4 className="font-black text-white">Buscando motoristas</h4>
                  <p className="text-[10px] text-zinc-500 font-medium mt-1">
                    Isso geralmente leva menos de 2 minutos.
                  </p>
                </div>
              </div>
            )}

            {/* Terminal States */}
            {(screenState === 'completed' || screenState === 'cancelled') && (
              <div className="space-y-4 pt-2">
                <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 flex justify-between items-center">
                  <span className="text-zinc-500 text-xs font-black uppercase">Valor Total</span>
                  <span className="text-white font-black text-xl">
                    R$ {(ride.final_price || ride.estimated_price).toFixed(2).replace('.', ',')}
                  </span>
                </div>
                
                <Button 
                  onClick={handleReturnHome}
                  className="w-full h-14 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-2"
                >
                  <Home size={18} />
                  Voltar ao Início
                </Button>
              </div>
            )}

            {/* Route & Stops Details */}
            <RideStopsTimeline ride={ride} />

            {/* Price Summary (Non-terminal) */}
            {screenState === 'active' && (
              <div className="flex justify-between items-center px-1 pt-2">
                <div>
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Estimativa</p>
                  <p className="text-white font-black text-lg">R$ {ride.estimated_price.toFixed(2).replace('.', ',')}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Pagamento</p>
                  <p className="text-white font-black text-sm uppercase tracking-tighter">{ride.payment_method}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Primary Action */}
        {actionAvailability?.canCancel && (
          <Button 
            variant="ghost"
            onClick={() => setIsCancelDialogOpen(true)}
            className="w-full h-12 text-zinc-600 font-black text-xs hover:text-red-500 hover:bg-red-500/5 rounded-2xl transition-colors"
          >
            CANCELAR CORRIDA
          </Button>
        )}
      </motion.div>

      {/* Dialogs */}
      <CancellationDialog 
        isOpen={isCancelDialogOpen}
        onClose={() => setIsCancelDialogOpen(false)}
        rideId={ride.id}
        onSuccess={() => {
          setIsCancelDialogOpen(false);
          loadRide(ride.id); // Refresh to update to cancelled state
        }}
      />
    </div>
  );
}
