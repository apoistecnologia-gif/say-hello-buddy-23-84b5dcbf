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
  "/_public/redefinir-senha"
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, authState, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isPublicPath = PUBLIC_PATHS.some(path => location.pathname === path || location.pathname === `/_public${path}`);

  useEffect(() => {
    // Only redirect if we are certain about the state
    if (authState === "initializing") return;

    if (authState === "unauthenticated" && !isPublicPath) {
      console.log("[AuthGuard] Not authenticated, redirecting to /login from:", location.pathname);
      navigate({ to: "/login" });
    } else if (authState === "authenticated" && isPublicPath) {
      console.log("[AuthGuard] Authenticated, redirecting to /inicio from public route:", location.pathname);
      navigate({ to: "/inicio" });
    }
  }, [authState, isPublicPath, navigate, location.pathname]);

  // Root level AuthGuard should not block public routes EVER
  // It only handles the global state synchronization
  if (isPublicPath) {
    return <>{children}</>;
  }

  // For non-public routes, show a localized loading if initializing
  if (authState === "initializing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black">
        <Loader2 className="text-apois-yellow animate-spin" size={32} />
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-4">Validando Sessão...</p>
      </div>
    );
  }

  // If not authenticated and not on a public path, we show an escape button while waiting for the useEffect redirect
  if (authState === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6 text-center">
        <p className="text-zinc-500 mb-4">Acesso restrito.</p>
        <button 
          onClick={() => navigate({ to: "/login" })}
          className="text-apois-yellow font-bold uppercase text-[10px] tracking-widest border border-apois-yellow/20 px-4 py-2 rounded-lg"
        >
          Ir para Login
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
