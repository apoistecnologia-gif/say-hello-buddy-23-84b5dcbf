import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    // In Capacitor/Preview, ensure we always land on a valid route
    throw redirect({ to: "/inicio" });
  },
  component: () => null,
});
