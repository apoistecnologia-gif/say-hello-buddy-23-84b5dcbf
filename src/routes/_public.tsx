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
    <div className="min-h-screen bg-zinc-950 flex justify-center selection:bg-yellow-500/30">
      <div className="relative w-full max-w-[430px] min-h-[100dvh] bg-black overflow-hidden flex flex-col">
        <AuthGuard>
          <Outlet />
        </AuthGuard>
        <Toaster />
      </div>
    </div>
  );
}
