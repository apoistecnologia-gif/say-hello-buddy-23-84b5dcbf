import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthGuard } from "@/components/auth/AuthGuard";

export const Route = createFileRoute("/_public")({
  beforeLoad: ({ context, location }) => {
    // This is handled by AuthGuard as well, but this is a static check
  },
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-yellow-500/30">
      <AuthGuard>
        <Outlet />
      </AuthGuard>
      <Toaster />
    </div>
  );
}
