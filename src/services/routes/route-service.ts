import { supabase } from "@/integrations/supabase/client";

export interface RouteCoordinates {
  lat: number;
  lng: number;
}

export interface RouteResponse {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  originName?: string;
  destinationName?: string;
}

export interface RouteRequest {
  origin: RouteCoordinates;
  destination: RouteCoordinates;
  intermediates?: RouteCoordinates[];
}

class RouteService {
  private static instance: RouteService;

  private constructor() {}

  public static getInstance(): RouteService {
    if (!RouteService.instance) {
      RouteService.instance = new RouteService();
    }
    return RouteService.instance;
  }

  public async computeRoute(request: RouteRequest): Promise<RouteResponse> {
    const { data, error } = await supabase.functions.invoke("compute-route", {
      body: request
    });

    if (error) {
      console.error("[RouteService] Error computing route:", error);
      throw error;
    }

    return data as RouteResponse;
  }
}

export const routeService = RouteService.getInstance();
