import type { ReactNode } from "react";
import { useEffect } from "react";
import { AlertTriangle, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = ["/", "/login", "/cadastro", "/recuperar-senha", "/redefinir-senha"];
const AUTHENTICATED_PUBLIC_PATHS = ["/redefinir-senha"];

const matchesPath = (pathname: string, allowedPath: string) => {
  if (allowedPath === "/") {
    return pathname === "/" || pathname === "/_public" || pathname === "/_public/";
  }

  return pathname === allowedPath || pathname === `/_public${allowedPath}`;
};

export function AuthGuard({ children }: { children: ReactNode }) {
  const { authState, error, isLoading, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicPath = PUBLIC_PATHS.some((path) => matchesPath(location.pathname, path));
  const canRenderWhileAuthenticated = AUTHENTICATED_PUBLIC_PATHS.some((path) =>
    matchesPath(location.pathname, path),
  );

  useEffect(() => {
    if (authState === "initializing") return;

    if (authState === "unauthenticated" && !isPublicPath) {
      console.info("[AuthGuard] Private route access without session");
      void navigate({ to: "/", replace: true });
      return;
    }

    if (authState === "authenticated" && isPublicPath && !canRenderWhileAuthenticated) {
      console.info("[AuthGuard] Authenticated user leaving public auth route");
      void navigate({ to: "/inicio", replace: true });
    }
  }, [authState, canRenderWhileAuthenticated, isPublicPath, navigate]);

  if (isPublicPath) return <>{children}</>;

  if (authState === "initializing") {
    return (
      <div className="app-viewport flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-apois-yellow/20 bg-apois-yellow/10">
          <Loader2 className="animate-spin text-apois-yellow" size={28} />
        </div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
          Verificando sua conta
        </p>
      </div>
    );
  }

  if (authState === "connection_error" || authState === "configuration_error") {
    const isConfigurationError = authState === "configuration_error";
    const Icon = isConfigurationError ? AlertTriangle : WifiOff;

    return (
      <div className="app-viewport app-safe-top app-safe-bottom app-safe-x flex min-h-[100dvh] items-center justify-center text-center text-white">
        <section className="app-surface w-full max-w-sm rounded-3xl p-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-apois-danger/25 bg-apois-danger/10 text-apois-danger">
            <Icon aria-hidden="true" size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">
            {isConfigurationError ? "Serviço indisponível" : "Não foi possível conectar"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {isConfigurationError
              ? "O aplicativo não conseguiu carregar a configuração necessária."
              : "Confira sua internet e tente restabelecer a sessão."}
          </p>
          {error ? <p className="mt-3 text-xs leading-5 text-zinc-600">{error}</p> : null}
          <PrimaryButton
            onClick={() => void refreshSession()}
            loading={isLoading}
            loadingLabel="Reconectando..."
            icon={<RefreshCw aria-hidden="true" size={19} />}
            className="mt-6"
          >
            Tentar novamente
          </PrimaryButton>
        </section>
      </div>
    );
  }

  if (authState !== "authenticated") return null;

  return <>{children}</>;
}
