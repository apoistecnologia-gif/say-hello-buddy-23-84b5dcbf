import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthState =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "configuration_error"
  | "connection_error";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Record<string, unknown> | null;
  authState: AuthState;
  isLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PROFILE_RETRY_DELAYS_MS = [0, 350, 900];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeProfileRequest = useRef(0);

  const clearLocalSessionState = useCallback(() => {
    activeProfileRequest.current += 1;
    setSession(null);
    setUser(null);
    setProfile(null);
    setAuthState("unauthenticated");
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (err) {
      console.error("[AuthProvider] Sign out error", err);
    } finally {
      clearLocalSessionState();
      window.localStorage.removeItem("apois-last-location");
    }
  }, [clearLocalSessionState]);

  const fetchProfile = useCallback(async (userId: string) => {
    const requestId = ++activeProfileRequest.current;

    for (const delay of PROFILE_RETRY_DELAYS_MS) {
      if (delay > 0) await sleep(delay);
      if (requestId !== activeProfileRequest.current) return null;

      const { data, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (requestId !== activeProfileRequest.current) return null;

      if (!profileError && data) {
        const normalizedProfile = data as Record<string, unknown>;
        setProfile(normalizedProfile);
        return normalizedProfile;
      }

      if (profileError) {
        console.warn("[AuthProvider] Profile fetch failed", {
          code: profileError.code,
          message: profileError.message,
        });
      }
    }

    // Authentication remains valid even if the profile trigger is temporarily delayed.
    if (requestId === activeProfileRequest.current) setProfile(null);
    return null;
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        activeProfileRequest.current += 1;
        setProfile(null);
        setAuthState("unauthenticated");
        return;
      }

      setAuthState("authenticated");
      await fetchProfile(nextSession.user.id);
    },
    [fetchProfile],
  );

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      await applySession(currentSession);
      setError(null);
    } catch (err) {
      console.error("[AuthProvider] Refresh error", err);
      setAuthState("connection_error");
      setError(err instanceof Error ? err.message : "Erro de conexão com o servidor.");
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        const {
          data: { session: initialSession },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!mounted) return;

        await applySession(initialSession);
        if (mounted) setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error("[AuthProvider] Initialization error", err);
        setAuthState("connection_error");
        setError("Não foi possível conectar ao serviço de autenticação.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setIsLoading(false);
      setError(null);
      void applySession(nextSession);
    });

    return () => {
      mounted = false;
      activeProfileRequest.current += 1;
      subscription.unsubscribe();
    };
  }, [applySession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        authState,
        isLoading,
        error,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
