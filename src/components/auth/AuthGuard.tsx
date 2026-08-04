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

  // Allow rendering if user exists or if we are on a public route (checked by Router usually, but safety here)
  const isPublicRoute = location.pathname === "/login" || 
                        location.pathname === "/cadastro" || 
                        location.pathname === "/recuperar-senha" ||
                        location.pathname === "/redefinir-senha";

  if (!user && !isPublicRoute) return null;

  return <>{children}</>;
}
