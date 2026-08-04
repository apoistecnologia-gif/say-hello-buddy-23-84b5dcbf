import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { GlobalErrorBoundary } from "@/components/diagnostics/GlobalErrorBoundary";
import { StartupTimeout } from "@/components/diagnostics/StartupTimeout";

const queryClient = new QueryClient();

export const Route = createRootRouteWithContext<{
  queryClient: typeof queryClient;
}>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <GlobalErrorBoundary>
      <StartupTimeout>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
          <AuthGuard>
            <div className="min-h-screen bg-black text-white selection:bg-yellow-500/30">
              <Outlet />
              <Toaster />
            </div>
          </AuthGuard>
          </AuthProvider>
        </QueryClientProvider>
      </StartupTimeout>
    </GlobalErrorBoundary>
  );
}
