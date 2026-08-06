import type { ReactNode } from "react";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
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
  const { authState } = useAuth();
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

  if (authState !== "authenticated") return null;

  return <>{children}</>;
}
