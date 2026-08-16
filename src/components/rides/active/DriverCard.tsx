import React, { useEffect, useState } from "react";
import { Phone, Star, User } from "lucide-react";
import type { ActiveRide } from "@/types/rides/active-ride";
import { supabase } from "@/integrations/supabase/client";

interface DriverCardProps {
  ride: ActiveRide;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function firstName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().split(/\s+/)[0];
  return normalized || fallback;
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

  if (!ride.driver_id && !ride.driver_name) return null;

  // Em superfícies compartilhadas Passageiro ↔ Motorista exibimos somente o
  // primeiro nome. O nome completo continua preservado no domínio/admin.
  const driverName = firstName(ride.driver_name, "Motorista");
  const hasRating =
    typeof ride.driver_rating === "number" && Number.isFinite(ride.driver_rating);

  return (
    <section className="app-surface flex min-w-0 items-center gap-3 rounded-2xl p-3 animate-in fade-in slide-in-from-bottom duration-500">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-apois-yellow/20 bg-zinc-800">
        {driverPhotoUrl ? (
          <img
            src={driverPhotoUrl}
            alt={`Foto de ${driverName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="text-zinc-600" size={21} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="break-words text-sm font-black leading-5 text-white">{driverName}</h4>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
          {hasRating ? (
            <div className="flex items-center gap-1 text-apois-yellow">
              <Star size={11} fill="currentColor" />
              <span className="text-[11px] font-black">{ride.driver_rating?.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Novo
            </span>
          )}
        </div>
      </div>

      {ride.driver_phone ? (
        <a
          href={`tel:${ride.driver_phone}`}
          aria-label={`Ligar para ${driverName}`}
          className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apois-yellow text-black"
        >
          <Phone size={17} />
        </a>
      ) : null}
    </section>
  );
};