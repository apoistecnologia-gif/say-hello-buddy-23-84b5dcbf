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
      <div style={{ position: 'fixed', top: 10, right: 10, background: 'red', color: 'white', padding: '5px 10px', zIndex: 9999, fontWeight: 'bold', fontSize: '12px' }}>
        APOIS BUILD TESTE 2026-08-04-1202
      </div>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

