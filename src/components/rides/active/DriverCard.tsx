import React, { useEffect, useState } from "react";
import { Phone, Star, User } from "lucide-react";
import type { ActiveRide } from "@/types/rides/active-ride";
import { supabase } from "@/integrations/supabase/client";
import { RidePixPaymentCard } from "@/components/rides/active/RidePixPaymentCard";

interface DriverCardProps {
  ride: ActiveRide;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export const DriverCard: React.FC<DriverCardProps> = ({ ride }) => {
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const photo = ride.driver_photo?.trim() ?? "";

    if (!photo) {
      setDriverPhotoUrl(null);
      return;
    }

    if (isHttpUrl(photo)) {
      setDriverPhotoUrl(photo);
      return;
    }

    setDriverPhotoUrl(null);
    void supabase.storage
      .from("profile-photos")
      .createSignedUrl(photo, 600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          console.warn("[APOIS Passageiro] foto do motorista indisponível", error?.message);
          setDriverPhotoUrl(null);
          return;
        }
        setDriverPhotoUrl(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [ride.driver_photo]);

  if (ride.status === "aguardando_pagamento" && ride.payment_method === "pix") {
    return <RidePixPaymentCard rideId={ride.id} provider={ride.payment_provider ?? null} />;
  }

  if (!ride.driver_id && !ride.driver_name) return null;

  const driverName = ride.driver_name?.trim() || "Motorista parceiro";
  const hasRating =
    typeof ride.driver_rating === "number" && Number.isFinite(ride.driver_rating);

  return (
    <section className="app-surface flex items-center gap-4 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom duration-500">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-apois-yellow/20 bg-zinc-800">
        {driverPhotoUrl ? (
          <img
            src={driverPhotoUrl}
            alt={`Foto de ${driverName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="text-zinc-600" size={24} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="truncate font-black text-white">{driverName}</h4>
        <div className="mt-1 flex items-center gap-2">
          {hasRating ? (
            <div className="flex items-center gap-1 text-apois-yellow">
              <Star size={12} fill="currentColor" />
              <span className="text-xs font-black">{ride.driver_rating?.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              Avaliação ainda indisponível
            </span>
          )}
        </div>
      </div>

      {ride.driver_phone ? (
        <a
          href={`tel:${ride.driver_phone}`}
          aria-label={`Ligar para ${driverName}`}
          className="app-pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-apois-yellow text-black"
        >
          <Phone size={20} />
        </a>
      ) : null}
    </section>
  );
};
