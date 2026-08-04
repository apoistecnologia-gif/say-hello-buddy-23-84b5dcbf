import React, { useState, useEffect } from "react";
import { AlertCircle, RefreshCcw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "@tanstack/react-router";

interface StartupTimeoutProps {
  children: React.ReactNode;
  timeoutMs?: number;
}

export const StartupTimeout: React.FC<StartupTimeoutProps> = ({ 
  children, 
  timeoutMs = 15000 
}) => {
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReady) {
        console.warn("[StartupTimeout] Application startup timed out after", timeoutMs, "ms");
        setIsTimedOut(true);
      }
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [isReady, timeoutMs]);

  const isPublicRoute = location.pathname.includes("login") || 
                        location.pathname.includes("cadastro") || 
                        location.pathname.includes("recuperar") ||
                        location.pathname.includes("redefinir");

  if (isTimedOut && !isReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black p-8 text-center text-white">
        <div className="w-20 h-20 rounded-full bg-apois-yellow/10 flex items-center justify-center mb-6">
          <AlertCircle className="text-apois-yellow" size={40} />
        </div>
        
        <h1 className="text-2xl font-black mb-2 text-apois-yellow">Não foi possível concluir a inicialização.</h1>
        <p className="text-zinc-400 text-sm font-medium mb-8 max-w-xs">
          O aplicativo está demorando mais que o esperado para carregar.
        </p>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button 
            onClick={() => window.location.reload()}
            className="bg-apois-yellow text-black font-black h-14 rounded-2xl flex items-center justify-center gap-2"
          >
            <RefreshCcw size={18} />
            Tentar Novamente
          </Button>

          {!isPublicRoute && (
            <Button 
              variant="outline"
              onClick={() => {
                setIsTimedOut(false);
                navigate({ to: "/login" });
              }}
              className="border-zinc-800 text-zinc-400 h-14 rounded-2xl flex items-center justify-center gap-2"
            >
              <LogIn size={18} />
              Ir para o Login
            </Button>
          )}
        </div>

        {import.meta.env.DEV && (
          <p className="mt-8 text-[10px] text-zinc-700 font-bold uppercase tracking-widest">
            DEBUG: {location.pathname}
          </p>
        )}
      </div>
    );
  }

  return (
    <div onAnimationStart={() => setIsReady(true)} className="contents">
      <div className="hidden animate-[pulse_0.1s_ease-in-out_infinite]" />
      {children}
    </div>
  );
};
