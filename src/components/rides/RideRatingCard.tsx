import { useEffect, useMemo, useState } from "react";
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

function normalizeRating(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export function RideRatingCard({
  rideId,
  driverName,
  currentRating = null,
  onRated,
  compact = false,
}: RideRatingCardProps) {
  const normalizedCurrentRating = normalizeRating(currentRating);
  const [selectedRating, setSelectedRating] = useState<number | null>(normalizedCurrentRating);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(normalizedCurrentRating !== null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const nextRating = normalizeRating(currentRating);
    setSelectedRating(nextRating);
    setHasSubmitted(nextRating !== null);
    if (nextRating !== null) {
      setHoveredRating(null);
      setSubmitError(null);
    }
  }, [currentRating]);

  const safeDriverName = useMemo(() => driverName?.trim() || "o motorista", [driverName]);
  const validRideId = rideId.trim();

  const submitRating = async (): Promise<void> => {
    const rating = normalizeRating(selectedRating);
    if (!rating || isSubmitting || hasSubmitted) return;
    if (!validRideId) {
      setSubmitError("Não foi possível identificar esta corrida para enviar a avaliação.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await rideRatingService.rate(validRideId, rating, comment.trim());
      const savedRating = normalizeRating(result.rating) ?? rating;
      setSelectedRating(savedRating);
      setHasSubmitted(true);
      setHoveredRating(null);
      toast.success("Avaliação enviada. Obrigado!");

      try {
        await onRated?.(savedRating);
      } catch (callbackError: unknown) {
        console.error("[APOIS Passenger Rating] refresh after rating failed", callbackError);
      }
    } catch (caughtError: unknown) {
      console.error("[APOIS Passenger Rating] submit failed", caughtError);
      setSubmitError("Não foi possível enviar sua avaliação agora. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasSubmitted && selectedRating !== null) {
    return (
      <section
        className="min-w-0 rounded-3xl border border-apois-success/20 bg-apois-success/8 p-4 sm:p-5"
        role="status"
        aria-live="polite"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-success/15 text-apois-success" aria-hidden="true">
            <CheckCircle2 size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-black text-white">Avaliação registrada</p>
            <p className="mt-1 break-words text-xs leading-5 text-zinc-400">
              Você avaliou {safeDriverName} com {selectedRating} de 5.
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
    <section
      className="min-w-0 rounded-3xl border border-apois-yellow/20 bg-gradient-to-br from-apois-yellow/10 to-zinc-950 p-4 sm:p-5"
      aria-busy={isSubmitting}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-apois-yellow text-black" aria-hidden="true">
          <Star size={21} fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black text-white">Como foi sua corrida?</p>
          <p className="mt-1 break-words text-xs leading-5 text-zinc-400">
            Sua avaliação ajuda a manter a comunidade APOIS segura e respeitosa.
          </p>
        </div>
      </div>

      <div
        className="mt-5 flex min-w-0 flex-wrap items-center justify-center gap-1 sm:gap-2"
        onMouseLeave={() => setHoveredRating(null)}
        role="group"
        aria-label="Escolha uma nota de 1 a 5 estrelas"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            disabled={isSubmitting}
            aria-label={`${value} estrela${value === 1 ? "" : "s"}: ${RATING_LABELS[value]}`}
            aria-pressed={selectedRating === value}
            onMouseEnter={() => !isSubmitting && setHoveredRating(value)}
            onFocus={() => !isSubmitting && setHoveredRating(value)}
            onBlur={() => setHoveredRating(null)}
            onClick={() => {
              setSelectedRating(value);
              setSubmitError(null);
            }}
            className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow sm:h-12 sm:w-12"
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
          <span className="flex min-w-0 items-center gap-2 break-words text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
            <MessageSquareText size={14} aria-hidden="true" className="shrink-0" />
            Comentário opcional
          </span>
          <textarea
            value={comment}
            onChange={(event) => {
              setComment(event.target.value.slice(0, 500));
              setSubmitError(null);
            }}
            disabled={isSubmitting}
            rows={3}
            maxLength={500}
            placeholder="Conte o que funcionou bem ou o que pode melhorar."
            className="mt-2 w-full min-w-0 max-w-full resize-y rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60 focus:border-apois-yellow/50 focus-visible:ring-2 focus-visible:ring-apois-yellow/30"
          />
          <span className="mt-1 block text-right text-xs font-bold text-zinc-600" aria-live="polite">
            {comment.length}/500
          </span>
        </label>
      ) : null}

      {submitError ? (
        <p role="alert" aria-live="assertive" className="mt-3 break-words rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-300">
          {submitError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void submitRating()}
        disabled={!normalizeRating(selectedRating) || isSubmitting || !validRideId}
        aria-busy={isSubmitting}
        className="app-pressable mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-apois-yellow px-4 py-2 text-center text-sm font-black leading-5 text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apois-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        {isSubmitting ? (
          <Loader2 className="shrink-0 animate-spin motion-reduce:animate-none" size={18} aria-hidden="true" />
        ) : (
          <Star className="shrink-0" size={18} aria-hidden="true" />
        )}
        <span className="break-words">{isSubmitting ? "Enviando avaliação..." : "Enviar avaliação"}</span>
      </button>
    </section>
  );
}
