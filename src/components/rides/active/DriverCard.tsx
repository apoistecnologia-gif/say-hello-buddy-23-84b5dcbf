import React, { useEffect, useState } from "react";
import { Phone, Star, User } from "lucide-react";
import type { ActiveRide } from "@/types/rides/active-ride";
import { supabase } from "@/integrations/supabase/client";

interface DriverCardProps {
  ride: ActiveRide;
}

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value);
}

function firstName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().split(/\s+/)[0];
  return normalized || fallback;
}

function normalizedPhone(value: string): string {
  return value.trim().replace(/[^\d+]/g, "");
}

function isCallablePhone(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value);
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

    if (isHttpsUrl(photo)) {
      setDriverPhotoUrl(photo);
      return;
    }

    setDriverPhotoUrl(null);
    void supabase.storage
      .from("profile-photos")
      .createSignedUrl(photo, 600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl || !isHttpsUrl(data.signedUrl)) {
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

  const driverName = firstName(ride.driver_name, "Motorista");
  const rating = Number(ride.driver_rating);
  const hasRating = Number.isFinite(rating) && rating >= 0 && rating <= 5;
  const phone = ride.driver_phone ? normalizedPhone(ride.driver_phone) : "";
  const canCall = isCallablePhone(phone);
  const ratingLabel = hasRating ? rating.toFixed(1).replace(".", ",") : "";

  return (
    <section
      className="app-surface flex min-w-0 items-center gap-3 rounded-2xl p-3 animate-in fade-in slide-in-from-bottom duration-500 motion-reduce:animate-none max-[339px]:items-start"
      aria-label={`Motorista ${driverName}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-apois-yellow/20 bg-zinc-800">
        {driverPhotoUrl ? (
          <img
            src={driverPhotoUrl}
            alt={`Foto de ${driverName}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setDriverPhotoUrl(null)}
            className="h-full w-full object-cover"
          />
        ) : (
          <User className="text-zinc-600" size={21} aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="break-words text-sm font-black leading-5 text-white">{driverName}</h4>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
          {hasRating ? (
            <div className="flex items-center gap-1 text-apois-yellow" aria-label={`Nota ${ratingLabel} de 5`}>
              <Star size={11} fill="currentColor" aria-hidden="true" />
              <span className="text-[11px] font-black tabular-nums">{ratingLabel}</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              Novo
            </span>
          )}
        </div>
      </div>

      {canCall ? (
        <a
          href={`tel:${phone}`}
          aria-label={`Ligar para ${driverName}`}
          className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-apois-yellow text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Phone size={17} aria-hidden="true" />
        </a>
      ) : null}
    </section>
  );
};