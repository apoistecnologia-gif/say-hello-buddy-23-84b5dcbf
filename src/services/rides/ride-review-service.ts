import { supabase } from "@/integrations/supabase/client";

export interface SubmitRideReviewInput {
  rideId: string;
  rating: number;
  tags: string[];
  comment?: string;
}

export interface SubmitRideReviewResult {
  ok: true;
  reviewId: string;
  rideId: string;
  rating: number;
  driverAverageRating: number | null;
}

type RpcError = { message?: string };
type RpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const friendlyReviewError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("ride_not_completed")) {
    return "A avaliação só fica disponível depois que a corrida é concluída.";
  }
  if (normalized.includes("ride_not_found")) {
    return "A corrida não foi encontrada na sua conta.";
  }
  if (normalized.includes("invalid_rating")) {
    return "Escolha uma nota de 1 a 5 estrelas.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Falha de conexão. Verifique a internet e tente novamente.";
  }
  return "Não foi possível enviar sua avaliação agora.";
};

class RideReviewService {
  async submit(input: SubmitRideReviewInput): Promise<SubmitRideReviewResult> {
    const rating = Math.floor(input.rating);
    if (!input.rideId.trim()) throw new Error("Corrida inválida para avaliação.");
    if (rating < 1 || rating > 5) throw new Error("Escolha uma nota de 1 a 5 estrelas.");

    const tags = Array.from(
      new Set(
        input.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
      ),
    );
    const comment = input.comment?.trim().slice(0, 500) || null;

    try {
      const rpcClient = supabase as unknown as RpcClient;
      const { data, error } = await rpcClient.rpc("rate_driver_for_ride", {
        _ride_id: input.rideId,
        _rating: rating,
        _tags: tags,
        _comment: comment,
      });

      if (error) throw new Error(error.message || "review_failed");
      if (!isRecord(data) || data["ok"] !== true) throw new Error("review_failed");

      const reviewId = typeof data["review_id"] === "string" ? data["review_id"] : "";
      const rideId = typeof data["ride_id"] === "string" ? data["ride_id"] : input.rideId;
      const returnedRating =
        typeof data["rating"] === "number" && Number.isFinite(data["rating"])
          ? data["rating"]
          : rating;
      const driverAverageRating =
        typeof data["driver_average_rating"] === "number" &&
        Number.isFinite(data["driver_average_rating"])
          ? data["driver_average_rating"]
          : null;

      return {
        ok: true,
        reviewId,
        rideId,
        rating: returnedRating,
        driverAverageRating,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "review_failed";
      throw new Error(friendlyReviewError(message));
    }
  }
}

export const rideReviewService = new RideReviewService();
