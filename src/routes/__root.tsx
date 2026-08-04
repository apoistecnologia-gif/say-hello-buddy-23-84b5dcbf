import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LocationProvider } from "@/hooks/use-location";
import { PickupAddressProvider } from "@/hooks/use-pickup-address";
import { DestinationProvider } from "@/hooks/use-destination";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { initializeNativePlatform, hideSplashScreen, setupBackButton } from "@/lib/platform/native";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover",
      },
      { title: "APOIS Passageiro" },
      { name: "description", content: "O aplicativo oficial para passageiros APOIS." },
      { name: "author", content: "APOIS" },
      { property: "og:title", content: "APOIS Passageiro" },
      { property: "og:description", content: "Mobilidade, tecnologia e segurança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@apois_oficial" },
    ],

    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    initializeNativePlatform();
    
    const removeBackButtonListener = setupBackButton(() => {
      // Estratégia simples de botão voltar: se puder voltar, volta.
      // Em implementações futuras, podemos verificar modais abertos.
      window.history.back();
    });

    return () => {
      removeBackButtonListener();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
          <PickupAddressProvider>
            <DestinationProvider>
              <AuthGuard>
              <div className="min-h-screen bg-black text-white selection:bg-yellow-500/30">
                <Outlet />
                <BottomNavigation />
              </div>
              </AuthGuard>
            </DestinationProvider>
          </PickupAddressProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, profile, isProfileLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const publicRoutes = ["/login", "/cadastro", "/recuperar-senha", "/redefinir-senha"];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  useEffect(() => {
    if (!isLoading) {
      if (!user && !isPublicRoute) {
        navigate({ to: "/login" });
      } else if (user && isPublicRoute) {
        navigate({ to: "/inicio" });
      }
    }
    if (!isLoading && !isProfileLoading) {
      hideSplashScreen();
    }
  }, [user, isLoading, isProfileLoading, isPublicRoute, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Se estiver logado, mas não tiver perfil (e não for rota pública)
  if (
    user &&
    !profile &&
    !isProfileLoading &&
    !isPublicRoute &&
    location.pathname !== "/cadastro"
  ) {
    console.warn("User logged in but profile missing from public.users");
  }

  return <>{children}</>;
}