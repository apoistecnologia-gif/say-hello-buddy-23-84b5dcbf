import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Only redirect if not loading, no user, and not already on a public route
    const isPublicRoute = location.pathname === "/login" || 
                          location.pathname === "/cadastro" || 
                          location.pathname === "/recuperar-senha" ||
                          location.pathname === "/redefinir-senha";

    if (!isLoading && !user && !isPublicRoute && !isRedirecting) {
      console.log("[AuthGuard] No session found, redirecting to /login from:", location.pathname);
      setIsRedirecting(true);
      navigate({ to: "/login" });
    }
  }, [user, isLoading, navigate, location.pathname, isRedirecting]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black">
        <Loader2 className="text-apois-yellow animate-spin" size={32} />
        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-4">Validando Sessão...</p>
      </div>
    );
  }

  // Allow rendering if user exists or if we are on a public route
  const isPublicRoute = location.pathname === "/login" || 
                        location.pathname === "/cadastro" || 
                        location.pathname === "/recuperar-senha" ||
                        location.pathname === "/redefinir-senha";

  if (!user && !isPublicRoute) {
    console.log("[AuthGuard] Blocking render (no user, not public route):", location.pathname);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
        <p className="text-zinc-500 mb-4">Aguardando autenticação...</p>
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
