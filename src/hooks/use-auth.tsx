import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

export type AuthState = "initializing" | "authenticated" | "unauthenticated" | "configuration_error" | "connection_error";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  authState: AuthState;
  isLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[AuthProvider] Sign out error:", err);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      setSession(session);
      setUser(session?.user ?? null);
      setAuthState(session ? "authenticated" : "unauthenticated");
      setError(null);
    } catch (err: any) {
      console.error("[AuthProvider] Refresh error:", err);
      setAuthState("connection_error");
      setError(err.message || "Erro de conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | null = null;

    const initAuth = async () => {
      // Security timeout to prevent hang
      timeoutId = window.setTimeout(() => {
        if (mounted && authState === "initializing") {
          console.warn("[AuthProvider] Initialization timeout.");
          setIsLoading(false);
          // Don't change authState to unauthenticated here, just stop blocking UI
        }
      }, 15000);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (sessionError) {
          console.error("[AuthProvider] Session error:", sessionError);
          setAuthState("connection_error");
          setError(sessionError.message);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          setAuthState(session ? "authenticated" : "unauthenticated");
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          console.error("[AuthProvider] Fatal init error:", err);
          setAuthState("connection_error");
          setError("Não foi possível conectar ao serviço de autenticação.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      
      console.log(`[AuthProvider] Auth event: ${event}`);
      
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setAuthState(newSession ? "authenticated" : "unauthenticated");
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    session,
    authState,
    isLoading,
    error,
    signOut,
    refreshSession
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
