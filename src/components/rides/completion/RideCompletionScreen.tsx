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
  pix: "PIX",
  credit: "Cartão de crédito",
  credit_card: "Cartão de crédito",
  debit: "Cartão de débito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  money: "Dinheiro",
  wallet: "Carteira APOIS",
};

export function RideCompletionScreen({
  ride,
  onReturnHome,
  onReviewSubmitted,
}: RideCompletionScreenProps) {
  const [rating, setRating] = useState<number>(ride.passenger_rating ?? 0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(ride.passenger_rating !== undefined);

  const availableTags = useMemo(
    () => (rating >= 4 ? positiveTags : improvementTags),
    [rating],
  );

  const total = ride.final_price ?? ride.estimated_price;
  const driverName = ride.driver_name?.trim() || "Motorista parceiro";
  const paymentLabel = paymentLabels[ride.payment_method] || "Pagamento selecionado";

  const toggleTag = (tag: string) => {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  };

  const submitReview = async () => {
    if (isSubmitting) return;
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
        comment,
      });
      setSubmitted(true);
      toast.success("Avaliação enviada. Obrigado!");
      await onReviewSubmitted();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar sua avaliação agora.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-screen app-safe-top app-safe-bottom min-h-[100dvh] min-w-0 bg-apois-black text-white">
      <div className="app-scroll min-w-0 px-4 pb-6 pt-5 sm:px-5">
        <section className="min-w-0 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-apois-success/30 bg-apois-success/10 text-apois-success shadow-[0_18px_50px_rgba(41,201,111,0.12)]">
            <CheckCircle2 size={42} strokeWidth={2.3} aria-hidden="true" />
          </div>
          <p className="mt-5 break-words text-xs font-black uppercase tracking-[0.2em] text-apois-success sm:tracking-[0.24em]">
            Corrida concluída
          </p>
          <h1 className="mt-2 break-words text-[clamp(26px,9vw,30px)] font-black leading-tight tracking-[-0.04em] text-white">
            Você chegou ao destino
          </h1>
          <p className="mx-auto mt-2 max-w-sm break-words text-sm leading-6 text-zinc-400">
            Confira o resumo e conte como foi sua experiência.
          </p>
        </section>

        <section className="app-surface mt-7 min-w-0 rounded-3xl p-4 sm:p-5">
          <div className="space-y-5">
            <RouteSummary label="Origem" value={ride.origin_name} accent="success" />
            <div className="ml-[7px] h-7 w-px bg-zinc-700" aria-hidden="true" />
            <RouteSummary label="Destino" value={ride.destination_name} accent="gold" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/7 pt-5 max-[339px]:grid-cols-1">
            <SummaryItem label="Valor total" value={formatCurrency(total)} highlight />
            <SummaryItem label="Pagamento" value={paymentLabel} />
            {ride.distance_km !== undefined ? (
              <SummaryItem label="Distância" value={`${ride.distance_km.toFixed(1)} km`} />
            ) : null}
            {ride.duration_min !== undefined ? (
              <SummaryItem label="Duração" value={`${Math.max(1, Math.round(ride.duration_min))} min`} />
            ) : null}
          </div>
        </section>

        <section className="app-surface mt-4 flex min-w-0 items-center gap-4 rounded-3xl p-4 sm:p-5">
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
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Seu motorista
            </p>
            <p className="mt-1 break-words text-base font-black leading-5 text-white">{driverName}</p>
            {ride.driver_vehicle_model || ride.driver_vehicle_plate ? (
              <p className="mt-0.5 break-words text-xs leading-5 text-zinc-500">
                {[ride.driver_vehicle_model, ride.driver_vehicle_plate]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            ) : null}
          </div>
        </section>

        <section className="app-surface mt-4 min-w-0 rounded-3xl p-4 text-center sm:p-5" aria-busy={isSubmitting}>
          {submitted ? (
            <div className="py-2" role="status" aria-live="polite">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow">
                <Star size={28} fill="currentColor" aria-hidden="true" />
              </div>
              <h2 className="mt-4 break-words text-xl font-black text-white">Avaliação enviada</h2>
              <p className="mt-2 break-words text-sm leading-6 text-zinc-400">
                Sua opinião ajuda a manter a comunidade APOIS mais segura e confiável.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-1" aria-label={`${rating} estrelas`}>
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
              <h2 className="mt-2 break-words text-2xl font-black tracking-tight text-white">
                Como foi sua viagem?
              </h2>
              <p className="mt-2 break-words text-xs leading-5 text-zinc-500">
                Escolha uma nota. Comentários e marcadores são opcionais.
              </p>

              <div className="mt-5 flex min-w-0 justify-center gap-1 sm:gap-2" role="radiogroup" aria-label="Nota da viagem">
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
                      className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-black/35 sm:h-12 sm:w-12"
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
                        className={`app-pressable min-h-11 max-w-full rounded-full border px-4 py-2 text-xs font-bold leading-4 ${
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
                  className="w-full min-w-0 max-w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow"
                />
                <span className="mt-1 block text-right text-[10px] text-zinc-600">
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
          className="app-pressable mt-4 min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm font-black leading-5 text-white"
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
