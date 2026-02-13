import { createContext, useContext, useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getProfile, createProfile } from "@/lib/profiles";
import type { Profile } from "@/types";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string, userName?: string) => {
    try {
      let userProfile = await getProfile(userId);

      // If profile doesn't exist, create it
      if (!userProfile && userName) {
        userProfile = await createProfile(userId, userName);
      }

      setProfile(userProfile);
      setLoading(false); // Loading complete (updated because other loads were sync and triggered early loading false)
      console.log("Profile loaded")
    } catch (error) {
      console.error("Error loading profile:", error);
      // Don't block auth if profile fails
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  useEffect(() => {
    // Get initial session
    console.log("=== AUTH CONTEXT: Getting initial session ===");
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log("Initial session:", session);
      console.log("Session error:", error);

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log("User found in session:", session.user.id);
        const userName =
          session.user.user_metadata?.name || session.user.email?.split("@")[0];
        // Load profile but don't block on it
        loadProfile(session.user.id, userName).catch(console.error);
      } else {
        console.log("No user in session");
        // No user - stop loading
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("=== AUTH STATE CHANGE ===");
      console.log("Event:", event);
      console.log("Session:", session);

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log("User authenticated:", session.user.id);
        const userName =
          session.user.user_metadata?.name || session.user.email?.split("@")[0];
        // Load profile but don't block on it
        loadProfile(session.user.id, userName).catch(console.error);
      } else {
        console.log("User signed out or no session");
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
