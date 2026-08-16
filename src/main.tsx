import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { routeTree } from "./routeTree.gen";
import apoisLogo from "@/assets/logo.jpg";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { registerNativePasswordRecoveryHandler } from "@/lib/auth/native-password-recovery";
import "./styles.css";
import "./android-system-bars.css";
import "./app-layout.css";
import "./native-intro.css";
import "./mobile-touch-targets.css";
import "./mobile-layout-hardening.css";
import "./mobile-ux-hardening-round4.css";
import "./mobile-ux-hardening-round5.css";

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
  const [showNativeIntro, setShowNativeIntro] = useState(() => Capacitor.isNativePlatform());

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash || hash === "#" || hash === "#/") {
      if (authState === "authenticated") {
        void router.navigate({ to: "/inicio", replace: true });
      } else if (authState === "unauthenticated") {
        void router.navigate({ to: "/login", replace: true });
      }
    }
  }, [authState]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const hideSplash = () => {
      void SplashScreen.hide().catch((error) => {
        console.warn("[SplashScreen] Não foi possível ocultar a splash", {
          message: error instanceof Error ? error.message : "unknown_error",
        });
      });
    };

    const frameId = window.requestAnimationFrame(hideSplash);
    const introTimer = window.setTimeout(() => setShowNativeIntro(false), 950);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(introTimer);
    };
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      {showNativeIntro ? (
        <div className="apois-native-intro" aria-hidden="true">
          <div className="apois-native-intro__brand">
            <img src={apoisLogo} alt="" className="apois-native-intro__logo" />
            <p className="apois-native-intro__eyebrow">APOIS PASSAGEIRO</p>
            <p className="apois-native-intro__tagline">Apois, vamos?</p>
          </div>
        </div>
      ) : null}
    </>
  );
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