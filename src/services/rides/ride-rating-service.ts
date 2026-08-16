import { supabase } from "@/integrations/supabase/client";

interface RpcErrorLike {
  code?: string;
  message: string;
}

interface UntypedRpcClient {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
}

export interface RideRatingResult {
  rideId: string;
  rating: number;
  commentSaved: boolean;
  driverAverageRating: number | null;
  driverRatingsCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function publicErrorMessage(error: RpcErrorLike): string {
  const message = error.message.toLowerCase();
  if (message.includes("ride_already_rated")) return "Esta corrida já foi avaliada.";
  if (message.includes("ride_not_completed")) return "A corrida ainda não foi concluída.";
  if (message.includes("ride_not_found")) return "A corrida não foi encontrada.";
  if (message.includes("rating_out_of_range")) return "Escolha uma nota de 1 a 5.";
  return "Não foi possível salvar sua avaliação agora.";
}

class RideRatingService {
  async rate(rideId: string, rating: number, comment: string): Promise<RideRatingResult> {
    const normalizedRideId = rideId.trim();
    const normalizedRating = Math.round(rating);
    const normalizedComment = comment.trim().slice(0, 500);

    if (!normalizedRideId) throw new Error("Corrida inválida.");
    if (normalizedRating < 1 || normalizedRating > 5) {
      throw new Error("Escolha uma nota de 1 a 5.");
    }

    const rpcClient = supabase as unknown as UntypedRpcClient;
    const { data, error } = await rpcClient.rpc("rate_passenger_ride", {
      _ride_id: normalizedRideId,
      _rating: normalizedRating,
      _comment: normalizedComment || null,
    });

    if (error) {
      console.error("[RideRatingService] Rating failed", {
        code: error.code,
        message: error.message,
        rideId: normalizedRideId,
      });
      throw new Error(publicErrorMessage(error));
    }

    if (!isRecord(data) || data["ok"] !== true) {
      throw new Error("O servidor não confirmou a avaliação.");
    }

    const returnedRating = readFiniteNumber(data["rating"]);
    const ratingsCount = readFiniteNumber(data["driver_ratings_count"]);
    const driverAverage = readFiniteNumber(data["driver_average_rating"]);

    if (typeof data["ride_id"] !== "string" || returnedRating === null) {
      throw new Error("O servidor retornou uma avaliação incompleta.");
    }

    return {
      rideId: data["ride_id"],
      rating: returnedRating,
      commentSaved: data["comment_saved"] === true,
      driverAverageRating: driverAverage,
      driverRatingsCount: ratingsCount === null ? 0 : Math.max(0, Math.round(ratingsCount)),
    };
  }
}

export const rideRatingService = new RideRatingService();
