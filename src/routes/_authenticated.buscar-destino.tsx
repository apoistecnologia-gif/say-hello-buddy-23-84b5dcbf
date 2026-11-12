import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { DestinationSearchScreen } from "@/features/destination/DestinationSearchScreen";

export const Route = createFileRoute("/_authenticated/buscar-destino")({
  validateSearch: (search: Record<string, unknown>): { stop: boolean; origin?: boolean } => ({
    stop: search["stop"] === true || search["stop"] === "true",
    ...(search["origin"] === true || search["origin"] === "true" ? { origin: true } : {}),
  }),
  component: BuscarDestinoPage,
});

function BuscarDestinoPage() {
  const navigate = useNavigate();
  const { stop: isStopSelection, origin: isOriginSelection } = Route.useSearch();

  const handleFinish = useCallback(() => {
    void navigate({ to: "/inicio" });
  }, [navigate]);

  return (
    <DestinationSearchScreen
      isStopSelection={isStopSelection}
      isOriginSelection={isOriginSelection === true}
      onFinish={handleFinish}
    />
  );
}
