import { createFileRoute } from "@tanstack/react-router";
import { PassengerProfileCenter } from "@/components/profile/PassengerProfileCenter";
import { PassengerAvatarControl } from "@/components/profile/PassengerAvatarControl";
import "@/components/profile/profile-center.css";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PassengerProfilePage,
});

function PassengerProfilePage() {
  return (
    <>
      <PassengerProfileCenter />
      <PassengerAvatarControl />
    </>
  );
}