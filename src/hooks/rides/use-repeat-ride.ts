import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDestination } from "@/hooks/use-destination";
import { useRideStops } from "@/hooks/rides/use-ride-stops";
import { useRideCategories } from "@/hooks/use-ride-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import type { PaymentMethodCode } from "@/types/payments";
import type { RideHistoryItem } from "@/types/rides/ride-history";

const PAYMENT_CODES = new Set<PaymentMethodCode>([
  "pix",
  "credit",
  "debit",
  "cash",
  "wallet",
]);

function normalizeCategory(code: string): string {
  if (code === "carro") return "carros";
  if (code === "moto") return "motos";
  return code;
}

function normalizePayment(code: string): PaymentMethodCode | null {
  if (code === "credit_card") return "credit";
  if (code === "debit_card") return "debit";
  if (code === "money") return "cash";
  return PAYMENT_CODES.has(code as PaymentMethodCode) ? (code as PaymentMethodCode) : null;
}

export function useRepeatRide() {
  const navigate = useNavigate();
  const { setDestination } = useDestination();
  const { restoreStops } = useRideStops();
  const { categories, setSelectedCategory } = useRideCategories();
  const { methods, setSelectedMethod } = usePaymentMethods();

  return useCallback(
    async (ride: RideHistoryItem): Promise<void> => {
      setDestination({
        label: ride.destinationName,
        formattedAddress: ride.destinationName,
        latitude: ride.destination.lat,
        longitude: ride.destination.lng,
        placeId: `ride-history:${ride.id}:destination`,
      });

      restoreStops(
        ride.intermediates.map((stop, index) => ({
          latitude: stop.lat,
          longitude: stop.lng,
          label: stop.label ?? stop.address ?? `Parada ${index + 1}`,
          formattedAddress: stop.address ?? stop.label ?? `Parada ${index + 1}`,
          placeId: stop.place_id ?? `ride-history:${ride.id}:stop:${index}`,
        })),
      );

      const previousCategory = normalizeCategory(ride.category);
      const category = categories.find(
        (item) => item.code === previousCategory || item.key === previousCategory,
      );
      if (category?.isActive) setSelectedCategory(category);

      const paymentCode = normalizePayment(ride.paymentMethod);
      if (paymentCode && methods.some((method) => method.code === paymentCode && method.isActive)) {
        setSelectedMethod(paymentCode);
      }

      await navigate({ to: "/inicio" });
    },
    [categories, methods, navigate, restoreStops, setDestination, setSelectedCategory, setSelectedMethod],
  );
}
