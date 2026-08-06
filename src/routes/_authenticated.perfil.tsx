import { createFileRoute } from "@tanstack/react-router";
import { PassengerProfileCenter } from "@/components/profile/PassengerProfileCenter";
import "@/components/profile/profile-center.css";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PassengerProfileCenter,
});
