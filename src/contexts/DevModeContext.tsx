import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { isDevModeActive, setDevModeActive, resetDevData } from "@/lib/devMode";

interface DevModeContextType {
  /** True only when the user is both flagged is_developer and has the toggle on. */
  devMode: boolean;
  /** Whether this account is allowed to use dev mode at all. */
  canUseDevMode: boolean;
  toggleDevMode: (on: boolean) => void;
  resetSandbox: () => void;
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

  const resetSandbox = useCallback(() => {
    if (user?.id) resetDevData(user.id);
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
