import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_public/index")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
