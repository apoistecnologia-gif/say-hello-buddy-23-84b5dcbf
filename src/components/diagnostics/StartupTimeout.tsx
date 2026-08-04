import React, { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartupTimeoutProps {
  children: React.ReactNode;
  timeoutMs?: number;
}

export const StartupTimeout: React.FC<StartupTimeoutProps> = ({ 
  children, 
  timeoutMs = 10000 
}) => {
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReady) {
        setIsTimedOut(true);
      }
    }, timeoutMs);

    // This is a safety check. In a real app, we'd check if all critical providers are initialized.
    // For now, we assume if it hasn't rendered in X seconds, something is stuck.
    return () => clearTimeout(timer);
  }, [isReady, timeoutMs]);

  if (isTimedOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black p-8 text-center text-white">
        <div className="w-20 h-20 rounded-full bg-apois-yellow/10 flex items-center justify-center mb-6">
          <AlertCircle className="text-apois-yellow" size={40} />
        </div>
        
        <h1 className="text-2xl font-black mb-2">Carregamento Lento</h1>
        <p className="text-zinc-400 text-sm font-medium mb-8 max-w-xs">
          O aplicativo está demorando mais do que o esperado para iniciar. Isso pode ser devido à conexão ou GPS.
        </p>

        <Button 
          onClick={() => window.location.reload()}
          className="bg-apois-yellow text-black font-black w-full h-14 rounded-2xl"
        >
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div onAnimationStart={() => setIsReady(true)}>
      {children}
    </div>
  );
};
