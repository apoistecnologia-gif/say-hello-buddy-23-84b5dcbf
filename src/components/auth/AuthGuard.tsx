import { useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/_public/login",
  "/_public/cadastro",
  "/_public/recuperar-senha",
  "/_public/redefinir-senha",
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authState } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicPath = PUBLIC_PATHS.some(
    (path) => location.pathname === path || location.pathname === `/_public${path}`,
  );

  useEffect(() => {
    // Only redirect if we are certain about the state
    if (authState === "initializing") return;

    if (authState === "unauthenticated" && !isPublicPath) {
      console.log("[AuthGuard] Private route access without auth, redirecting to /login");
      navigate({ to: "/login" });
    } else if (authState === "authenticated" && isPublicPath) {
      console.log("[AuthGuard] Public route access with auth, redirecting to /inicio");
      navigate({ to: "/inicio" });
    }
  }, [authState, isPublicPath, navigate, location.pathname]);

  // Public routes always render immediately
  if (isPublicPath) {
    return <>{children}</>;
  }

  // Private routes: wait for initialization
  if (authState === "initializing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 text-center">
        <Loader2 className="animate-spin text-apois-yellow mb-4" size={32} />
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
          Verificando autenticação...
        </p>
      </div>
    );
  }

  // If not authenticated, we show nothing (useEffect will redirect)
  if (authState !== "authenticated") {
    return null;
  }

  return <>{children}</>;
}
