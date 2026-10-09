import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { isDevModeActive, setDevModeActive, resetDevData } from "@/lib/devMode";
import { supabase } from "@/lib/supabase";

interface DevModeContextType {
  /** True only when the user is both flagged is_developer and has the toggle on. */
  devMode: boolean;
  /** Whether this account is allowed to use dev mode at all. */
  canUseDevMode: boolean;
  toggleDevMode: (on: boolean) => void;
  resetSandbox: () => Promise<void>;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

export function DevModeProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [active, setActive] = useState(() => isDevModeActive());

  const canUseDevMode = !!profile?.is_developer;
  const devMode = canUseDevMode && active;

  const toggleDevMode = useCallback((on: boolean) => {
    setDevModeActive(on);
    setActive(on);
  }, []);

  const resetSandbox = useCallback(async () => {
    if (!user?.id) return;
    resetDevData(user.id);
    // FRCdle's daily roll lives server-side, so clear it through the spin service.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const { data, error } = await supabase.functions.invoke("frcdle-spin", {
      body: { action: "reset", timeZone },
    });
    if (error) {
      // Non-2xx responses hide the server's message inside the response body.
      const body = await error.context?.json?.().catch(() => null);
      throw new Error(body?.error || error.message || "Could not reset the FRCdle roll.");
    }
    if (data?.error) throw new Error(data.error);
  }, [user]);

  return (
    <DevModeContext.Provider value={{ devMode, canUseDevMode, toggleDevMode, resetSandbox }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (!context) {
    throw new Error("useDevMode must be used within DevModeProvider");
  }
  return context;
}
