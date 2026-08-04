import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // Basic auth check logic here if needed, or just redirect to start logic
    // But since we want the login screen if no session, and /index logic should be explicit:
    console.log("[Root Index] Redirecting to /inicio...");
    throw redirect({ to: "/inicio" });
  },
  loader: () => {
    // Safety return
    return { title: "APOIS" };
  },
  component: () => (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-apois-yellow"></div>
    </div>
  ),
});
