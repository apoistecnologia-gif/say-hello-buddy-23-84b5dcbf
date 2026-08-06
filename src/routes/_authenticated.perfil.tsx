import { createFileRoute } from "@tanstack/react-router";
import { PassengerProfileCenter } from "@/components/profile/PassengerProfileCenter";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PassengerProfileCenter,
});
