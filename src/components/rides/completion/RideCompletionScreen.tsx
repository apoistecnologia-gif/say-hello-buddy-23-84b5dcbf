import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquareText,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { rideReviewService } from "@/services/rides/ride-review-service";
import { formatCurrency } from "@/lib/utils";
import type { ActiveRide } from "@/types/rides/active-ride";

interface RideCompletionScreenProps {
  ride: ActiveRide;
  onReturnHome: () => void;
  onReviewSubmitted: () => Promise<void>;
}

const positiveTags = [
  "Direção segura",
  "Cordialidade",
  "Pontualidade",
  "Veículo limpo",
  "Boa comunicação",
] as const;

const improvementTags = [
  "Direção",
  "Pontualidade",
  "Limpeza",
  "Comunicação",
  "Comportamento",
] as const;

const paymentLabels: Record<string, string> = {
  pix: "Pix",
  credit: "Cartão de crédito",
  credit_card: "Cartão de crédito",
  debit: "Cartão de débito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  money: "Dinheiro",
  wallet: "Carteira APOIS",
};

function safeRating(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 0;
}

function firstName(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] || "Motorista parceiro";
}

function safeMoney(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? formatCurrency(parsed) : "Valor indisponível";
}

function safeDistance(value: unknown): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return `${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function safeDuration(value: unknown): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return `${Math.max(1, Math.round(parsed))} min`;
}

export function RideCompletionScreen({
  ride,
  onReturnHome,
  onReviewSubmitted,
}: RideCompletionScreenProps) {
  const initialRating = safeRating(ride.passenger_rating);
  const [rating, setRating] = useState<number>(initialRating);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initialRating > 0);

  const availableTags = useMemo(
    () => (rating >= 4 ? positiveTags : improvementTags),
    [rating],
  );

  const total = ride.final_price ?? ride.estimated_price;
  const totalLabel = safeMoney(total);
  const driverName = firstName(ride.driver_name);
  const normalizedPayment = ride.payment_method?.trim().toLowerCase() ?? "";
  const paymentLabel = paymentLabels[normalizedPayment] || "Pagamento registrado";
  const distanceLabel = safeDistance(ride.distance_km);
  const durationLabel = safeDuration(ride.duration_min);
  const originLabel = ride.origin_name?.trim() || "Origem não informada";
  const destinationLabel = ride.destination_name?.trim() || "Destino não informado";
  const vehicleModel = ride.driver_vehicle_model?.trim() || "";
  const vehiclePlate = ride.driver_vehicle_plate?.trim().toUpperCase() || "";

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const submitReview = async () => {
    if (isSubmitting || submitted) return;
    if (rating < 1 || rating > 5) {
      toast.error("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }

    setIsSubmitting(true);
    try {
      await rideReviewService.submit({
        rideId: ride.id,
        rating,
        tags: selectedTags,
        comment: comment.trim(),
      });
      setSubmitted(true);
      toast.success("Avaliação enviada. Obrigado!");
      await onReviewSubmitted();
    } catch (error: unknown) {
      console.error("[RideCompletionScreen] review submission failed", error);
      toast.error("Não foi possível enviar sua avaliação agora. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-screen app-safe-top app-safe-bottom min-h-[100dvh] min-w-0 bg-apois-black text-white">
      <div className="app-scroll min-w-0 px-4 pb-6 pt-5 sm:px-5">
        <section className="min-w-0 text-center" aria-labelledby="ride-completed-title">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-apois-success/30 bg-apois-success/10 text-apois-success shadow-[0_18px_50px_rgba(41,201,111,0.12)]">
            <CheckCircle2 size={42} strokeWidth={2.3} aria-hidden="true" />
          </div>
          <p className="mt-5 break-words text-xs font-black uppercase tracking-[0.2em] text-apois-success sm:tracking-[0.24em]">
            Corrida concluída
          </p>
          <h1 id="ride-completed-title" className="mt-2 break-words text-[clamp(26px,9vw,30px)] font-black leading-tight tracking-[-0.04em] text-white">
            Você chegou ao destino
          </h1>
          <p className="mx-auto mt-2 max-w-sm break-words text-sm leading-6 text-zinc-400">
            Confira o resumo e conte como foi sua experiência.
          </p>
        </section>

        <section className="app-surface mt-7 min-w-0 rounded-3xl p-4 sm:p-5" aria-label="Resumo da corrida">
          <div className="space-y-5">
            <RouteSummary label="Origem" value={originLabel} accent="success" />
            <div className="ml-[7px] h-7 w-px bg-zinc-700" aria-hidden="true" />
            <RouteSummary label="Destino" value={destinationLabel} accent="gold" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/7 pt-5 max-[339px]:grid-cols-1">
            <SummaryItem label="Valor total" value={totalLabel} highlight={totalLabel !== "Valor indisponível"} />
            <SummaryItem label="Pagamento" value={paymentLabel} />
            {distanceLabel ? <SummaryItem label="Distância" value={distanceLabel} /> : null}
            {durationLabel ? <SummaryItem label="Duração" value={durationLabel} /> : null}
          </div>
        </section>

        <section className="app-surface mt-4 flex min-w-0 flex-wrap items-center gap-4 rounded-3xl p-4 sm:flex-nowrap sm:p-5" aria-label="Motorista da corrida">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-zinc-500">
            {ride.driver_photo ? (
              <img
                src={ride.driver_photo}
                alt={`Foto de ${driverName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserRound size={25} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-[140px] flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Seu motorista
            </p>
            <p className="mt-1 break-words text-base font-black leading-5 text-white">{driverName}</p>
            {vehicleModel || vehiclePlate ? (
              <p className="mt-0.5 break-words text-xs leading-5 text-zinc-500">
                {[vehicleModel, vehiclePlate].filter(Boolean).join(" • ")}
              </p>
            ) : (
              <p className="mt-0.5 break-words text-xs leading-5 text-zinc-500">Veículo não informado</p>
            )}
          </div>
        </section>

        <section className="app-surface mt-4 min-w-0 rounded-3xl p-4 text-center sm:p-5" aria-busy={isSubmitting} aria-labelledby="ride-review-title">
          {submitted ? (
            <div className="py-2" role="status" aria-live="polite">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow">
                <Star size={28} fill="currentColor" aria-hidden="true" />
              </div>
              <h2 id="ride-review-title" className="mt-4 break-words text-xl font-black text-white">Avaliação enviada</h2>
              <p className="mt-2 break-words text-sm leading-6 text-zinc-400">
                Sua opinião ajuda a manter a comunidade APOIS mais segura e confiável.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1" aria-label={`${rating} de 5 estrelas`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={22}
                    aria-hidden="true"
                    className={index < rating ? "text-apois-yellow" : "text-zinc-700"}
                    fill={index < rating ? "currentColor" : "none"}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-apois-yellow">
                Avaliação do motorista
              </p>
              <h2 id="ride-review-title" className="mt-2 break-words text-2xl font-black tracking-tight text-white">
                Como foi sua viagem?
              </h2>
              <p className="mt-2 break-words text-xs leading-5 text-zinc-500">
                Escolha uma nota. Comentários e marcadores são opcionais.
              </p>

              <div className="mt-5 flex min-w-0 flex-wrap justify-center gap-1 sm:gap-2" role="radiogroup" aria-label="Nota da viagem">
                {Array.from({ length: 5 }, (_, index) => {
                  const value = index + 1;
                  const active = value <= rating;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
                      onClick={() => {
                        setRating(value);
                        setSelectedTags([]);
                      }}
                      className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow sm:h-12 sm:w-12"
                    >
                      <Star
                        size={26}
                        aria-hidden="true"
                        className={active ? "text-apois-yellow" : "text-zinc-700"}
                        fill={active ? "currentColor" : "none"}
                      />
                    </button>
                  );
                })}
              </div>

              {rating > 0 ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Marcadores da avaliação">
                  {availableTags.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTag(tag)}
                        className={`app-pressable min-h-11 max-w-full rounded-full border px-4 py-2 text-xs font-bold leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow ${
                          selected
                            ? "border-apois-yellow bg-apois-yellow text-black"
                            : "border-white/10 bg-white/5 text-zinc-400"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <label className="mt-5 block min-w-0 text-left">
                <span className="mb-2 flex min-w-0 items-center gap-2 break-words text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  <MessageSquareText size={14} aria-hidden="true" className="shrink-0" /> Comentário opcional
                </span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                  placeholder="Conte o que foi bom ou o que pode melhorar."
                  className="w-full min-w-0 max-w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow focus:ring-2 focus:ring-apois-yellow/30"
                />
                <span className="mt-1 block text-right text-[10px] text-zinc-600" aria-live="polite">
                  {comment.length}/500
                </span>
              </label>

              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={rating === 0 || isSubmitting}
                aria-busy={isSubmitting}
                className="app-pressable app-gold-glow mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-apois-yellow px-4 py-3 text-center text-base font-black leading-5 text-black disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
              >
                {isSubmitting ? <Loader2 className="mr-2 shrink-0 animate-spin" size={20} aria-hidden="true" /> : null}
                {isSubmitting ? "Enviando avaliação..." : "Enviar avaliação"}
              </button>
            </>
          )}
        </section>

        <button
          type="button"
          onClick={onReturnHome}
          disabled={isSubmitting}
          className="app-pressable mt-4 min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-black leading-5 text-white disabled:opacity-50"
        >
          {submitted ? "Voltar ao início" : "Avaliar depois"}
        </button>
      </div>
    </div>
  );
}

function RouteSummary({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "success" | "gold";
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div
        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          accent === "success" ? "bg-apois-success/15" : "bg-apois-yellow/15"
        }`}
        aria-hidden="true"
      >
        <MapPin
          size={11}
          className={accent === "success" ? "text-apois-success" : "text-apois-yellow"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-1 break-words text-sm font-bold leading-5 text-white">{value}</p>
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="break-words text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={`mt-1 break-words text-sm font-black leading-5 ${highlight ? "text-apois-yellow" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
