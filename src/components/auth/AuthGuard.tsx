import type { ReactNode } from "react";
import { useEffect } from "react";
import { AlertTriangle, Loader2, LogOut, RefreshCw, UserRoundX, WifiOff } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { PrimaryButton } from "@/components/app/PrimaryButton";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/termos",
  "/privacidade",
];
const PUBLIC_PREFIXES = ["/acompanhar/"];
const AUTHENTICATED_PUBLIC_PATHS = ["/redefinir-senha", "/termos", "/privacidade"];
const AUTHENTICATED_PUBLIC_PREFIXES = ["/acompanhar/"];

const matchesPath = (pathname: string, allowedPath: string) => {
  if (allowedPath === "/") {
    return pathname === "/" || pathname === "/_public" || pathname === "/_public/";
  }

  return pathname === allowedPath || pathname === `/_public${allowedPath}`;
};

const matchesPrefix = (pathname: string, allowedPrefix: string) =>
  pathname.startsWith(allowedPrefix) || pathname.startsWith(`/_public${allowedPrefix}`);

function LoadingAccount() {
  return (
    <div className="app-viewport flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center text-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-apois-yellow/20 bg-apois-yellow/10">
        <Loader2 className="animate-spin text-apois-yellow" size={28} />
      </div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
        Carregando sua conta
      </p>
    </div>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { authState, error, isLoading, profile, refreshSession, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicPath =
    PUBLIC_PATHS.some((path) => matchesPath(location.pathname, path)) ||
    PUBLIC_PREFIXES.some((prefix) => matchesPrefix(location.pathname, prefix));
  const canRenderWhileAuthenticated =
    AUTHENTICATED_PUBLIC_PATHS.some((path) => matchesPath(location.pathname, path)) ||
    AUTHENTICATED_PUBLIC_PREFIXES.some((prefix) => matchesPrefix(location.pathname, prefix));

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

  if (authState === "initializing") return <LoadingAccount />;

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

  if (authState === "authenticated" && isLoading && !profile) return <LoadingAccount />;

  if (authState === "authenticated" && !profile) {
    return (
      <div className="app-viewport app-safe-top app-safe-bottom app-safe-x flex min-h-[100dvh] items-center justify-center text-center text-white">
        <section className="app-surface w-full max-w-sm rounded-3xl p-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-apois-danger/25 bg-apois-danger/10 text-apois-danger">
            <UserRoundX aria-hidden="true" size={29} />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">Não foi possível carregar sua conta</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Sua sessão foi encontrada, mas o perfil do passageiro ainda não está disponível. Nenhuma corrida será solicitada até essa verificação concluir.
          </p>
          <PrimaryButton
            onClick={() => void refreshSession()}
            loading={isLoading}
            loadingLabel="Verificando..."
            icon={<RefreshCw aria-hidden="true" size={19} />}
            className="mt-6"
          >
            Verificar novamente
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void signOut()}
            className="app-pressable mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-black text-zinc-300"
          >
            <LogOut aria-hidden="true" size={18} />
            Sair desta conta
          </button>
        </section>
      </div>
    );
  }

  if (authState !== "authenticated") return null;

  return <>{children}</>;
}
