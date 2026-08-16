import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useActiveRide } from "@/hooks/rides/use-active-ride";
import { ActiveRideMap } from "@/components/map/ActiveRideMap";
import { DriverCard } from "@/components/rides/active/DriverCard";
import { VehicleCard } from "@/components/rides/active/VehicleCard";
import { CancellationDialog } from "@/components/rides/active/CancellationDialog";
import { RideSafetyDialog } from "@/components/rides/active/RideSafetyDialog";
import { SearchingDriverScreen } from "@/components/rides/active/SearchingDriverScreen";
import { ActiveJourneyScreen } from "@/components/rides/active/ActiveJourneyScreen";
import { RideRatingCard } from "@/components/rides/RideRatingCard";
import { RidePixPaymentCard } from "@/components/payments/RidePixPaymentCard";
import { Button } from "@/components/ui/button";
import { passengerShareService } from "@/services/safety/passenger-share-service";
import { FileText, Home, RefreshCw, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/corrida/$rideId")({
  component: ActiveRidePage,
});

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function firstName(value: unknown): string {
  const text = cleanText(value, "");
  return text ? text.split(/\s+/)[0] || "Motorista" : "Motorista";
}

function normalizedPlate(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) : "";
}

function safeMoney(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatMoney(value: unknown): string {
  const amount = safeMoney(value);
  return amount === null
    ? "Valor indisponível"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
}

function publicShareUrl(token: string): string | null {
  const safeToken = token.trim();
  if (!safeToken) return null;
  const configuredBase = String(import.meta.env.VITE_PUBLIC_APP_URL ?? "").trim();
  const currentOriginIsPublic =
    window.location.protocol.startsWith("http") &&
    !["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
  const base = configuredBase || (currentOriginIsPublic ? `${window.location.origin}${window.location.pathname}` : "");
  if (!base) return null;

  const normalizedBase = base.replace(/\/#\/?$/, "").replace(/\/+$/, "");
  return `${normalizedBase}/#/acompanhar/${encodeURIComponent(safeToken)}`;
}

function ActiveRidePage() {
  const { rideId } = Route.useParams();
  const navigate = useNavigate();
  const {
    ride,
    status,
    screenState,
    isRefreshing,
    isRealtimeConnected,
    loadRide,
    refreshRide,
    actionAvailability,
    clearRide,
  } = useActiveRide();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isSafetyDialogOpen, setIsSafetyDialogOpen] = useState(false);
  const [isSharingRide, setIsSharingRide] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    setIsCancelDialogOpen(false);
    setIsSafetyDialogOpen(false);
    setShareError(null);
    if (rideId?.trim()) void loadRide(rideId);
  }, [rideId, loadRide]);

  const originName = useMemo(() => cleanText(ride?.origin_name, "Origem não informada"), [ride?.origin_name]);
  const destinationName = useMemo(() => cleanText(ride?.destination_name, "Destino não informado"), [ride?.destination_name]);

  const handleBack = () => {
    if (screenState === "completed") {
      clearRide();
      void navigate({ to: "/corridas/$rideId", params: { rideId } });
      return;
    }
    if (screenState === "cancelled") clearRide();
    void navigate({ to: "/inicio" });
  };

  const handleReturnHome = () => {
    clearRide();
    void navigate({ to: "/inicio" });
  };

  const handleShareRide = async (): Promise<void> => {
    if (!ride || isSharingRide) return;
    setShareError(null);

    if (!publicShareUrl("preview")) {
      setShareError("O acompanhamento público não está disponível nesta versão do aplicativo.");
      return;
    }

    setIsSharingRide(true);
    try {
      const session = await passengerShareService.create(ride.id);
      const trackingUrl = publicShareUrl(cleanText(session.token, ""));
      if (!trackingUrl) throw new Error("public_share_url_unavailable");

      const vehicle = [cleanText(ride.driver_vehicle_model, ""), cleanText(ride.driver_vehicle_color, "")]
        .filter(Boolean)
        .join(" • ");
      const plate = normalizedPlate(ride.driver_vehicle_plate);
      const lines = [
        "Acompanhe minha corrida pela APOIS.",
        `Origem: ${originName}`,
        `Destino: ${destinationName}`,
        ride.driver_name ? `Motorista: ${firstName(ride.driver_name)}` : null,
        vehicle ? `Veículo: ${vehicle}` : null,
        plate ? `Placa: ${plate}` : null,
        `Acompanhamento: ${trackingUrl}`,
      ].filter((line): line is string => Boolean(line));
      const text = lines.join("\n");

      if (navigator.share) {
        await navigator.share({ title: "Acompanhamento de corrida APOIS", text, url: trackingUrl });
        return;
      }

      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("Link protegido de acompanhamento copiado.");
    } catch (caughtError: unknown) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return;
      console.error("[APOIS Passenger Share] share failed", caughtError);
      setShareError("Não foi possível compartilhar esta corrida agora. Tente novamente.");
    } finally {
      setIsSharingRide(false);
    }
  };

  if (screenState === "loading" || screenState === "idle") {
    return (
      <div className="flex min-h-[100dvh] min-w-0 flex-col space-y-5 overflow-x-hidden bg-black px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+20px)]" role="status" aria-label="Carregando corrida">
        <div className="flex min-w-0 items-center gap-4">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full bg-zinc-900" />
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-5 w-40 max-w-full bg-zinc-900" /><Skeleton className="h-3 w-28 max-w-full bg-zinc-900" /></div>
        </div>
        <Skeleton className="h-[clamp(240px,42dvh,330px)] w-full rounded-[26px] bg-zinc-900" />
        <Skeleton className="h-24 w-full rounded-3xl bg-zinc-900" />
        <Skeleton className="h-40 w-full rounded-3xl bg-zinc-900" />
      </div>
    );
  }

  if (screenState === "not_found" || screenState === "unauthorized" || screenState === "failed") {
    const canRetry = screenState === "failed";
    return (
      <div className="flex min-h-[100dvh] min-w-0 flex-col items-center justify-center space-y-6 overflow-x-hidden bg-black px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)] text-center" role={canRetry ? "alert" : undefined}>
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/8 bg-zinc-900" aria-hidden="true"><X className="text-zinc-600" size={40} /></div>
        <div className="min-w-0 max-w-sm space-y-2">
          <h2 className="break-words text-xl font-black text-white">Não foi possível abrir a corrida</h2>
          <p className="break-words text-sm font-medium leading-6 text-zinc-400">
            {screenState === "not_found" ? "Esta corrida não foi encontrada." : screenState === "unauthorized" ? "Você não tem permissão para visualizar esta corrida." : "Não conseguimos carregar os dados agora."}
          </p>
        </div>
        {canRetry ? <Button onClick={() => void loadRide(rideId)} className="min-h-12 w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 font-black text-white focus-visible:ring-2 focus-visible:ring-apois-yellow"><RefreshCw size={17} aria-hidden="true" />Tentar novamente</Button> : null}
        <Button onClick={handleReturnHome} className="min-h-12 w-full max-w-sm rounded-2xl bg-apois-yellow font-black text-black focus-visible:ring-2 focus-visible:ring-white">Voltar para o início</Button>
      </div>
    );
  }

  if (!ride || !status) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-black px-5 text-center text-sm font-bold text-zinc-400" role="status">Atualizando dados da corrida...</div>;
  }

  const isQueuedRide = status === "procurar_motorista" && Boolean(ride.driver_id && ride.queued_after_ride_id);

  if (status === "aguardando_pagamento" && screenState === "active") {
    return (
      <>
        <div className="app-screen min-h-0 min-w-0 bg-black text-white">
          <header className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black pb-3 pt-3 text-center">
            <p className="break-words text-[11px] font-black uppercase tracking-[0.18em] text-apois-yellow">APOIS</p>
            <h1 className="mt-1 break-words text-xl font-black">Pagamento da corrida</h1>
            <p className="mt-1 break-words text-xs leading-5 text-zinc-400">Nenhum motorista será chamado enquanto o Pix estiver pendente.</p>
          </header>

          <div className="app-scroll min-w-0 flex-1 space-y-3 px-4 py-4">
            <section className="h-[clamp(170px,28dvh,210px)] min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-zinc-900" aria-label="Mapa da rota confirmada"><ActiveRideMap ride={ride} /></section>

            <section className="min-w-0 rounded-3xl border border-white/8 bg-[#0e1014] p-4" aria-label="Rota confirmada">
              <p className="break-words text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Rota confirmada</p>
              <p className="mt-2 break-words text-sm font-bold leading-5 text-zinc-300 [overflow-wrap:anywhere]">{originName}</p>
              <p className="my-1 text-xs text-zinc-500" aria-hidden="true">até</p>
              <p className="break-words text-sm font-bold leading-5 text-zinc-300 [overflow-wrap:anywhere]">{destinationName}</p>
            </section>

            <RidePixPaymentCard rideId={ride.id} officialAmount={ride.estimated_price} />

            <button type="button" onClick={() => void refreshRide()} disabled={isRefreshing} aria-busy={isRefreshing} className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-center text-xs font-black text-zinc-300 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow">
              <RefreshCw size={16} className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
              {isRefreshing ? "Atualizando status..." : "Atualizar status da corrida"}
            </button>

            {actionAvailability?.canCancel ? <button type="button" onClick={() => setIsCancelDialogOpen(true)} disabled={isRefreshing} className="app-pressable min-h-12 w-full rounded-2xl border border-red-400/20 bg-red-400/5 px-4 text-xs font-black text-red-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Cancelar solicitação</button> : null}
          </div>
        </div>

        <CancellationDialog isOpen={isCancelDialogOpen} onClose={() => setIsCancelDialogOpen(false)} rideId={ride.id} rideCreatedAt={ride.created_at} onSuccess={() => { setIsCancelDialogOpen(false); clearRide(); void navigate({ to: "/inicio", replace: true }); }} />
      </>
    );
  }

  if (status === "procurar_motorista" && !isQueuedRide && screenState === "active") {
    return (
      <>
        <SearchingDriverScreen ride={ride} isRefreshing={isRefreshing} isRealtimeConnected={isRealtimeConnected} canCancel={Boolean(actionAvailability?.canCancel)} onRefresh={() => void refreshRide()} onCancel={() => setIsCancelDialogOpen(true)} />
        <CancellationDialog isOpen={isCancelDialogOpen} onClose={() => setIsCancelDialogOpen(false)} rideId={ride.id} rideCreatedAt={ride.created_at} onSuccess={() => { setIsCancelDialogOpen(false); clearRide(); void navigate({ to: "/inicio", replace: true }); }} />
      </>
    );
  }

  if (screenState === "active" && ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status)) {
    return (
      <>
        {shareError ? <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-[70] mx-auto max-w-md rounded-2xl border border-red-400/20 bg-zinc-950/95 p-3 text-xs font-bold leading-5 text-red-300 shadow-xl backdrop-blur" role="alert" aria-live="assertive">{shareError}</div> : null}
        <ActiveJourneyScreen ride={ride} status={status} isRefreshing={isRefreshing} isRealtimeConnected={isRealtimeConnected} canCancel={Boolean(actionAvailability?.canCancel)} canShare={Boolean(actionAvailability?.canShareRide)} canOpenSafety={Boolean(actionAvailability?.canOpenSafety)} isSharing={isSharingRide} onBack={handleBack} onRefresh={() => void refreshRide()} onCancel={() => setIsCancelDialogOpen(true)} onShare={() => void handleShareRide()} onSafety={() => setIsSafetyDialogOpen(true)} />
        <CancellationDialog isOpen={isCancelDialogOpen} onClose={() => setIsCancelDialogOpen(false)} rideId={ride.id} rideCreatedAt={ride.created_at} onSuccess={() => { setIsCancelDialogOpen(false); clearRide(); void navigate({ to: "/inicio", replace: true }); }} />
        <RideSafetyDialog open={isSafetyDialogOpen} onOpenChange={setIsSafetyDialogOpen} driverName={ride.driver_name} driverPhone={ride.driver_phone} onShareRide={async () => { setIsSafetyDialogOpen(false); await handleShareRide(); }} />
      </>
    );
  }

  if (screenState === "completed" || screenState === "cancelled") {
    const totalPrice = safeMoney(ride.final_price ?? ride.estimated_price);
    return (
      <div className="app-screen min-h-0 min-w-0 bg-black text-white">
        <header className="app-safe-top app-safe-x shrink-0 border-b border-white/5 bg-black pb-3 pt-3 text-center">
          <p className="break-words text-[11px] font-black uppercase tracking-[0.18em] text-apois-yellow">APOIS</p>
          <h1 className="mt-1 break-words text-xl font-black">{screenState === "completed" ? "Corrida finalizada" : "Corrida encerrada"}</h1>
        </header>

        <div className="app-scroll min-w-0 flex-1 space-y-3 px-4 py-4">
          <section className="h-[clamp(180px,30dvh,220px)] min-w-0 overflow-hidden rounded-[26px] border border-white/8 bg-zinc-900" aria-label="Mapa da corrida encerrada"><ActiveRideMap ride={ride} /></section>

          <section className="min-w-0 rounded-3xl border border-white/8 bg-[#0e1014] p-4" role="status">
            <p className="break-words text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">Valor total</p>
            <p className="mt-1 max-w-full break-words text-[clamp(24px,9vw,30px)] font-black tabular-nums text-apois-yellow">{totalPrice === null ? "Valor indisponível" : formatMoney(totalPrice)}</p>
          </section>

          {screenState === "completed" ? <RideRatingCard rideId={ride.id} driverName={ride.driver_name} currentRating={ride.passenger_rating ?? null} onRated={() => loadRide(ride.id)} /> : null}

          {screenState === "completed" ? <Button onClick={() => { clearRide(); void navigate({ to: "/corridas/$rideId", params: { rideId: ride.id } }); }} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-4 text-center font-black text-black focus-visible:ring-2 focus-visible:ring-white"><FileText size={18} aria-hidden="true" />Ver comprovante e detalhes</Button> : null}

          <Button onClick={handleReturnHome} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-center font-black text-black focus-visible:ring-2 focus-visible:ring-apois-yellow"><Home size={18} aria-hidden="true" />Voltar ao início</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-screen min-h-0 min-w-0 bg-black text-white">
      <div className="relative min-h-[280px] flex-1">
        <ActiveRideMap ride={ride} />
        <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] min-w-0 rounded-2xl border border-apois-yellow/20 bg-black/85 p-4 backdrop-blur-xl sm:inset-x-4" role="status" aria-live="polite">
          <p className="break-words text-[11px] font-black uppercase tracking-[0.14em] text-apois-yellow">{isQueuedRide ? "Motorista confirmado" : "Corrida programada"}</p>
          <p className="mt-2 break-words text-sm font-black leading-5">{isQueuedRide ? "Sua corrida já está reservada. Seu motorista está finalizando uma viagem próxima." : "Acompanhe aqui quando a corrida ficar disponível."}</p>
        </div>
      </div>
      <div className="min-w-0 shrink-0 space-y-3 rounded-t-[28px] border-t border-white/8 bg-[#0e1014] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 sm:p-5">
        {isQueuedRide ? <><DriverCard ride={ride} /><VehicleCard ride={ride} /></> : null}
        <button type="button" onClick={() => void refreshRide()} disabled={isRefreshing} aria-busy={isRefreshing} className="app-pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-center text-xs font-black text-zinc-300 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow"><RefreshCw size={16} className={isRefreshing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />{isRefreshing ? "Atualizando corrida..." : "Atualizar corrida"}</button>
      </div>
    </div>
  );
}
