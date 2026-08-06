import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { registerNativePasswordRecoveryHandler } from "@/lib/auth/native-password-recovery";
import "./styles.css";

const queryClient = new QueryClient();
const hashHistory = createHashHistory();

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: {
    queryClient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

void registerNativePasswordRecoveryHandler({
  onReady: async () => {
    await router.navigate({ to: "/redefinir-senha", replace: true });
  },
  onError: async (reason) => {
    console.warn("[NativePasswordRecovery] Link rejected", { reason });
    await router.navigate({ to: "/redefinir-senha", replace: true });
  },
}).catch((error) => {
  console.error("[NativePasswordRecovery] Listener initialization failed", {
    message: error instanceof Error ? error.message : "unknown_error",
  });
});

const Normalizer = () => {
  const { authState } = useAuth();

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash || hash === "#" || hash === "#/") {
      if (authState === "authenticated") {
        void router.navigate({ to: "/inicio", replace: true });
      } else if (authState === "unauthenticated") {
        void router.navigate({ to: "/", replace: true });
      }
    }
  }, [authState]);

  return <RouterProvider router={router} />;
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado");
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <Normalizer />
    </AuthProvider>
  </QueryClientProvider>,
);
