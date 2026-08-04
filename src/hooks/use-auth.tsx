import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "moderator" | "user" | "passenger" | "driver";

export interface UserProfile {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  city: string | null;
  average_rating: number | null;
  total_ratings: number | null;
  completed_rides: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  profile: UserProfile | null;
  role: AppRole | null;
  isProfileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const fetchProfile = async (userId: string) => {
    setIsProfileLoading(true);
    try {
      // Carregar perfil oficial da tabela public.users
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (userError) {
        console.error("Error fetching user profile:", userError);
        setProfile(null);
      } else {
        setProfile(userData as UserProfile | null);
      }

      // Validar role em public.user_roles
      if (userData?.id) {
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.id)
          .eq("role", "passenger")
          .maybeSingle();

        if (roleError) {
          console.error("Error fetching user role:", roleError);
          setRole(null);
        } else {
          setRole(roleData?.role as AppRole | null);
        }
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
      setProfile(null);
      setRole(null);
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id);
      }
      setIsLoading(false);
    });

    // 2. Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);
      setSession(session);
      setUser(session?.user ?? null);

      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user?.id) {
        fetchProfile(session.user.id);
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setRole(null);
      }

      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        profile,
        role,
        isProfileLoading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
