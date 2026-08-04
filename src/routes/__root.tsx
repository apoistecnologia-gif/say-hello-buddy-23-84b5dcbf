import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { GlobalErrorBoundary } from "@/components/diagnostics/GlobalErrorBoundary";
import { StartupTimeout } from "@/components/diagnostics/StartupTimeout";
import { AuthGuard } from "@/components/auth/AuthGuard";

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
              <Outlet />
            </AuthGuard>
          </AuthProvider>
        </QueryClientProvider>
      </StartupTimeout>
    </GlobalErrorBoundary>
  );
}

