import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { teardownPush } from "@/services/push/push-service";

export type AuthState =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "configuration_error"
  | "connection_error";

export interface AuthProfile {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  city: string | null;
  average_rating: number | null;
  completed_rides: number | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: AuthProfile | null;
  authState: AuthState;
  isLoading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PROFILE_RETRY_DELAYS_MS = [0, 350, 900];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const normalizeProfile = (value: unknown): AuthProfile | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"] : null;
  if (!id) return null;

  const readNullableString = (key: string): string | null => {
    const field = record[key];
    return typeof field === "string" && field.trim().length > 0 ? field : null;
  };

  const readNullableNumber = (key: string): number | null => {
    const field = record[key];
    return typeof field === "number" && Number.isFinite(field) ? field : null;
  };

  const name = readNullableString("name");
  const blockedAt = readNullableString("blocked_at");
  const suspendedAt = readNullableString("suspended_at");
  const blockedReason = readNullableString("block_reason");

  return {
    id,
    auth_user_id: readNullableString("auth_user_id"),
    name,
    full_name: name,
    email: readNullableString("email"),
    phone: readNullableString("phone"),
    avatar_url: readNullableString("avatar_url"),
    city: readNullableString("city"),
    average_rating: readNullableNumber("average_rating"),
    completed_rides: readNullableNumber("completed_rides"),
    is_blocked: Boolean(blockedAt || suspendedAt || blockedReason),
    blocked_reason: blockedReason,
    created_at: readNullableString("created_at"),
    updated_at: readNullableString("updated_at"),
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeProfileRequest = useRef(0);
  const activeAuthUserId = useRef<string | null>(null);

  const clearLocalSessionState = useCallback(() => {
    activeProfileRequest.current += 1;
    activeAuthUserId.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    setAuthState("unauthenticated");
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await teardownPush();
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

      let { data, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (!data && !profileError) {
        const legacyResult = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        data = legacyResult.data;
        profileError = legacyResult.error;
      }

      if (requestId !== activeProfileRequest.current) return null;

      if (!profileError && data) {
        const normalizedProfile = normalizeProfile(data);
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

    if (requestId === activeProfileRequest.current) {
      setProfile(null);
      console.warn("[AuthProvider] Auth session exists without a readable public profile", {
        authUserId: userId,
      });
    }

    return null;
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      const userChanged = activeAuthUserId.current !== nextUserId;

      activeAuthUserId.current = nextUserId;
      setSession(nextSession);
      setUser(nextUser);

      if (!nextUser) {
        activeProfileRequest.current += 1;
        setProfile(null);
        setAuthState("unauthenticated");
        return;
      }

      if (userChanged) setProfile(null);
      setAuthState("authenticated");
      await fetchProfile(nextUser.id);
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

      void (async () => {
        setIsLoading(true);
        setError(null);
        await applySession(nextSession);
        if (mounted) setIsLoading(false);
      })();
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
