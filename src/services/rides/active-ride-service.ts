import { supabase } from "@/integrations/supabase/client";
import { ActiveRide, RideStatus } from "@/types/rides/active-ride";
import { RealtimeChannel } from "@supabase/supabase-js";

class ActiveRideService {
  private static instance: ActiveRideService;
  private channel: RealtimeChannel | null = null;
  private lastUpdateTimestamp: number = 0;

  private constructor() {}

  public static getInstance(): ActiveRideService {
    if (!ActiveRideService.instance) {
      ActiveRideService.instance = new ActiveRideService();
    }
    return ActiveRideService.instance;
  }

  public async getRideById(rideId: string, userId: string): Promise<ActiveRide> {
    const { data, error } = await (supabase
      .from("rides" as any)
      .select("*") as any)
      .eq("id", rideId)
      .single();

    if (error) throw error;
    if (!data) throw new Error("not_found");
    if (data.passenger_id !== userId) throw new Error("unauthorized");

    return this.normalizeRide(data);
  }

  public async getActiveRide(userId: string): Promise<ActiveRide | null> {
    const activeStatuses: RideStatus[] = [
      "procurar_motorista",
      "motorista_a_caminho",
      "motorista_chegou",
      "em_viagem"
    ];

    const { data, error } = await (supabase
      .from("rides" as any)
      .select("*") as any)
      .eq("passenger_id", userId)
      .in("status", activeStatuses)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? this.normalizeRide(data) : null;
  }

  public subscribeToRide(rideId: string, onUpdate: (ride: ActiveRide) => void): RealtimeChannel {
    this.unsubscribe();

    this.channel = supabase
      .channel(`ride_active_${rideId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "rides",
          filter: `id=eq.${rideId}`
        },
        (payload: any) => {
          const newRide = payload.new as any;
          const updateTimestamp = new Date(newRide.updated_at).getTime();

          // Protect against out-of-order events
          if (updateTimestamp > this.lastUpdateTimestamp) {
            this.lastUpdateTimestamp = updateTimestamp;
            onUpdate(this.normalizeRide(newRide));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Subscribed to ride ${rideId}`);
        }
      });

    return this.channel;
  }

  public unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  private normalizeRide(data: any): ActiveRide {
    return {
      ...data,
      origin: typeof data.origin === 'string' ? JSON.parse(data.origin) : data.origin,
      destination: typeof data.destination === 'string' ? JSON.parse(data.destination) : data.destination,
      intermediates: data.intermediates ? (typeof data.intermediates === 'string' ? JSON.parse(data.intermediates) : data.intermediates) : [],
    } as ActiveRide;
  }

  public getActionAvailability(status: RideStatus, ride: ActiveRide): any {
    const isTerminal = ["finalizada", "cancelada_passageiro", "cancelada_motorista"].includes(status);
    
    return {
      canCancel: ["procurar_motorista", "motorista_a_caminho", "motorista_chegou"].includes(status),
      canContactDriver: !!ride.driver_id && ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status),
      canOpenSafety: ["motorista_a_caminho", "motorista_chegou", "em_viagem"].includes(status),
      canRate: status === "finalizada" && !ride.passenger_rating,
      canRequestAgain: isTerminal,
      canReturnHome: isTerminal,
      canViewReceipt: status === "finalizada",
      canShareRide: !!ride.share_token && !isTerminal
    };
  }
}

export const activeRideService = ActiveRideService.getInstance();
