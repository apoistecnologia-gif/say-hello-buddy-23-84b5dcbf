import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthGuard } from "@/components/auth/AuthGuard";

export const Route = createFileRoute("/_public")({
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <AuthGuard>
      <div className="app-viewport flex h-[100dvh] min-h-0 justify-center overflow-hidden bg-apois-black selection:bg-apois-yellow/30">
        <div className="relative flex h-full min-h-0 w-full max-w-[430px] flex-col overflow-hidden bg-apois-black shadow-[0_0_80px_rgba(0,0,0,0.55)]">
          <Outlet />
        </div>
      </div>
      <Toaster position="top-center" />
    </AuthGuard>
  );
}
