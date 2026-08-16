import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";
import { rideRatingService } from "@/services/rides/ride-rating-service";

interface RideRatingCardProps {
  rideId: string;
  driverName?: string | null | undefined;
  currentRating?: number | null | undefined;
  onRated?: ((rating: number) => void | Promise<void>) | undefined;
  compact?: boolean | undefined;
}

const RATING_LABELS: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Regular",
  4: "Boa",
  5: "Excelente",
};

export function RideRatingCard({
  rideId,
  driverName,
  currentRating = null,
  onRated,
  compact = false,
}: RideRatingCardProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(currentRating);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(currentRating !== null);

  useEffect(() => {
    if (currentRating !== null) {
      setSelectedRating(currentRating);
      setHasSubmitted(true);
    }
  }, [currentRating]);

  const submitRating = async (): Promise<void> => {
    if (!selectedRating || isSubmitting || hasSubmitted) return;
    setIsSubmitting(true);
    try {
      const result = await rideRatingService.rate(rideId, selectedRating, comment);
      setSelectedRating(result.rating);
      setHasSubmitted(true);
      toast.success("Avaliação enviada. Obrigado!");
      await onRated?.(result.rating);
    } catch (caughtError: unknown) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível enviar sua avaliação.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasSubmitted && selectedRating !== null) {
    return (
      <section className="min-w-0 rounded-3xl border border-apois-success/20 bg-apois-success/8 p-4 sm:p-5" role="status" aria-live="polite">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-success/15 text-apois-success">
            <CheckCircle2 size={21} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-black text-white">Avaliação registrada</p>
            <p className="mt-1 break-words text-xs leading-5 text-zinc-400">
              Você avaliou {driverName?.trim() || "o motorista"} com {selectedRating} de 5.
            </p>
            <div
              className="mt-3 flex flex-wrap items-center gap-1 text-apois-yellow"
              aria-label={`${selectedRating} de 5 estrelas`}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <Star
                  key={value}
                  size={17}
                  aria-hidden="true"
                  fill={value <= selectedRating ? "currentColor" : "none"}
                  className={value <= selectedRating ? "text-apois-yellow" : "text-zinc-700"}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const visibleRating = hoveredRating ?? selectedRating ?? 0;

  return (
    <section className="min-w-0 rounded-3xl border border-apois-yellow/20 bg-gradient-to-br from-apois-yellow/10 to-zinc-950 p-4 sm:p-5" aria-busy={isSubmitting}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow text-black">
          <Star size={21} fill="currentColor" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-white">Como foi sua corrida?</p>
          <p className="mt-1 break-words text-xs leading-5 text-zinc-400">
            Sua avaliação ajuda a manter a comunidade APOIS segura e respeitosa.
          </p>
        </div>
      </div>

      <div
        className="mt-5 flex min-w-0 items-center justify-center gap-1 sm:gap-2"
        onMouseLeave={() => setHoveredRating(null)}
        role="group"
        aria-label="Escolha uma nota de 1 a 5 estrelas"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} estrela${value === 1 ? "" : "s"}: ${RATING_LABELS[value]}`}
            aria-pressed={selectedRating === value}
            onMouseEnter={() => setHoveredRating(value)}
            onFocus={() => setHoveredRating(value)}
            onBlur={() => setHoveredRating(null)}
            onClick={() => setSelectedRating(value)}
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow sm:h-12 sm:w-12"
          >
            <Star
              size={compact ? 28 : 30}
              aria-hidden="true"
              fill={value <= visibleRating ? "currentColor" : "none"}
              className={value <= visibleRating ? "text-apois-yellow" : "text-zinc-700"}
            />
          </button>
        ))}
      </div>

      <p className="mt-1 min-h-5 break-words text-center text-xs font-black leading-5 text-apois-yellow" aria-live="polite">
        {visibleRating > 0 ? RATING_LABELS[visibleRating] : "Toque nas estrelas para avaliar"}
      </p>

      {!compact ? (
        <label className="mt-4 block min-w-0">
          <span className="flex min-w-0 items-center gap-2 break-words text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            <MessageSquareText size={14} aria-hidden="true" className="shrink-0" />
            Comentário opcional
          </span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="Conte o que funcionou bem ou o que pode melhorar."
            className="mt-2 w-full min-w-0 max-w-full resize-none rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-base text-white outline-none placeholder:text-zinc-700 focus:border-apois-yellow/50"
          />
          <span className="mt-1 block text-right text-[10px] font-bold text-zinc-700">
            {comment.length}/500
          </span>
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => void submitRating()}
        disabled={!selectedRating || isSubmitting}
        aria-busy={isSubmitting}
        className="app-pressable mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-4 py-2 text-center text-sm font-black leading-5 text-black disabled:bg-zinc-800 disabled:text-zinc-600"
      >
        {isSubmitting ? <Loader2 className="shrink-0 animate-spin" size={18} aria-hidden="true" /> : <Star className="shrink-0" size={18} aria-hidden="true" />}
        {isSubmitting ? "Enviando avaliação..." : "Enviar avaliação"}
      </button>
    </section>
  );
}
