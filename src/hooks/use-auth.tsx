import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

export type AuthState =
  "initializing" | "authenticated" | "unauthenticated" | "configuration_error" | "connection_error";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
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
  const [profile, setProfile] = useState<any | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setAuthState("unauthenticated");

      // Clear sensitive memory/local storage if needed
      window.localStorage.removeItem("apois-last-location");
    } catch (err) {
      console.error("[AuthProvider] Sign out error:", err);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    let retries = 3;
    while (retries > 0) {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("auth_user_id", userId)
          .single();

        if (error) throw error;

        if (data) {
          setProfile(data);
          return;
        }
      } catch (err) {
        console.warn(`[AuthProvider] Profile fetch attempt failed (${retries} left):`, err);
        await new Promise((res) => setTimeout(res, 1000));
      }
      retries--;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error) throw error;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
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

    const initAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error("[AuthProvider] Session error:", sessionError);
          setAuthState("connection_error");
          setError(sessionError.message);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setProfile(null);
          }
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
        }
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      console.log(`[AuthProvider] Auth event: ${event}`);

      if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        // Handle explicit sign out or user deletion/update
        if (!newSession) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setAuthState("unauthenticated");
        }
      }

      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        fetchProfile(newSession.user.id);
        setAuthState("authenticated");
      } else if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN") {
        setSession(null);
        setUser(null);
        setProfile(null);
        setAuthState("unauthenticated");
      }

      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    session,
    profile,
    authState,
    isLoading,
    error,
    signOut,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
