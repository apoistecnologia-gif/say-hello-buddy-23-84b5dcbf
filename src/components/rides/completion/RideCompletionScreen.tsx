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
  const paymentLabel = paymentLabels[ride.payment_method] || ride.payment_method;

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
    <div className="app-screen app-safe-top app-safe-bottom min-h-[100dvh] bg-apois-black text-white">
      <div className="app-scroll px-5 pb-6 pt-5">
        <section className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-apois-success/30 bg-apois-success/10 text-apois-success shadow-[0_18px_50px_rgba(41,201,111,0.12)]">
            <CheckCircle2 size={42} strokeWidth={2.3} />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-apois-success">
            Corrida concluída
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Você chegou ao destino
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">
            Confira o resumo e conte como foi sua experiência.
          </p>
        </section>

        <section className="app-surface mt-7 rounded-3xl p-5">
          <div className="space-y-5">
            <RouteSummary label="Origem" value={ride.origin_name} accent="success" />
            <div className="ml-[7px] h-7 w-px bg-zinc-700" />
            <RouteSummary label="Destino" value={ride.destination_name} accent="gold" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/7 pt-5">
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

        <section className="app-surface mt-4 flex items-center gap-4 rounded-3xl p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-800 text-zinc-500">
            {ride.driver_photo ? (
              <img
                src={ride.driver_photo}
                alt={`Foto de ${driverName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserRound size={25} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
              Seu motorista
            </p>
            <p className="mt-1 truncate text-base font-black text-white">{driverName}</p>
            {ride.driver_vehicle_model || ride.driver_vehicle_plate ? (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {[ride.driver_vehicle_model, ride.driver_vehicle_plate]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            ) : null}
          </div>
        </section>

        <section className="app-surface mt-4 rounded-3xl p-5 text-center">
          {submitted ? (
            <div className="py-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apois-yellow/10 text-apois-yellow">
                <Star size={28} fill="currentColor" />
              </div>
              <h2 className="mt-4 text-xl font-black text-white">Avaliação enviada</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Sua opinião ajuda a manter a comunidade APOIS mais segura e confiável.
              </p>
              <div className="mt-4 flex justify-center gap-1" aria-label={`${rating} estrelas`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={22}
                    className={index < rating ? "text-apois-yellow" : "text-zinc-700"}
                    fill={index < rating ? "currentColor" : "none"}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-apois-yellow">
                Avaliação do motorista
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                Como foi sua viagem?
              </h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Escolha uma nota. Comentários e marcadores são opcionais.
              </p>

              <div className="mt-5 flex justify-center gap-2" role="radiogroup" aria-label="Nota da viagem">
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
                      className="app-pressable flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-black/35"
                    >
                      <Star
                        size={27}
                        className={active ? "text-apois-yellow" : "text-zinc-700"}
                        fill={active ? "currentColor" : "none"}
                      />
                    </button>
                  );
                })}
              </div>

              {rating > 0 ? (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {availableTags.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`app-pressable min-h-10 rounded-full border px-4 text-xs font-bold ${
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

              <label className="mt-5 block text-left">
                <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  <MessageSquareText size={14} /> Comentário opcional
                </span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Conte o que foi bom ou o que pode melhorar."
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 p-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-apois-yellow"
                />
                <span className="mt-1 block text-right text-[10px] text-zinc-600">
                  {comment.length}/500
                </span>
              </label>

              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={rating === 0 || isSubmitting}
                className="app-pressable app-gold-glow mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-apois-yellow px-5 text-base font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
              >
                {isSubmitting ? <Loader2 className="mr-2 animate-spin" size={20} /> : null}
                {isSubmitting ? "Enviando avaliação..." : "Enviar avaliação"}
              </button>
            </>
          )}
        </section>

        <button
          type="button"
          onClick={onReturnHome}
          className="app-pressable mt-4 min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-black text-white"
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
    <div className="flex items-start gap-3">
      <div
        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          accent === "success" ? "bg-apois-success/15" : "bg-apois-yellow/15"
        }`}
      >
        <MapPin
          size={11}
          className={accent === "success" ? "text-apois-success" : "text-apois-yellow"}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-1 text-sm font-bold leading-5 text-white">{value}</p>
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
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${highlight ? "text-apois-yellow" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
