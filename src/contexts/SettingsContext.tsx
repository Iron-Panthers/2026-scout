import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import settingsConfig from "@/config/settings.json";
import { getActiveEvent } from "@/lib/matches";
import { getGameProfile } from "@/lib/gameProfiles";
import { COSMETICS, THEME_BACKGROUNDS_SETTING, themeValueFor, type ThemeBackground } from "@/config/cosmetics";
import type { GameProfile } from "@/types";

interface SettingsContextType {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => void;
  /**
   * Re-applies the theme equipped on the active game profile, e.g. after switching between
   * the developer sandbox and the real account; the default theme when none is equipped.
   */
  syncThemeFromProfile: () => Promise<void>;
}

/** The theme a game profile's equipped theme applies, if the profile owns it; the default dark theme otherwise. */
function profileTheme(gameProfile: GameProfile, backgrounds?: Record<string, ThemeBackground>): string {
  const equippedId = gameProfile.equipped_cosmetics?.["theme"];
  const theme = equippedId ? COSMETICS.find((c) => c.id === equippedId && c.category === "theme") : undefined;
  const owned = !!theme && (theme.default || (gameProfile.owned_cosmetics ?? []).includes(theme.id));
  return (owned && themeValueFor(theme, backgrounds?.[theme.id])) || "dark";
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  // Bumped by every theme change. Syncing the theme from the game profile is a fetch that can
  // resolve *after* a live equip (or after the sandbox is toggled again) — a sync only applies
  // if nothing changed the theme since it started, so it never clobbers a newer theme.
  const themeVersionRef = useRef(0);

  const userId = user?.id;
  const syncThemeFromProfile = useCallback(async () => {
    if (!userId) return;
    const version = ++themeVersionRef.current;
    // The sandbox's profile while dev mode is on, the account's otherwise
    const gameProfile = await getGameProfile(userId);
    if (!gameProfile || version !== themeVersionRef.current) return;
    setSettings((prev) => {
      // Keeps the background (light/dark) this browser picked for the theme, if it has a choice
      const theme = profileTheme(gameProfile, prev[THEME_BACKGROUNDS_SETTING]);
      if (prev.theme === theme) return prev;
      const updated = { ...prev, theme };
      localStorage.setItem(`settings_${userId}`, JSON.stringify(updated));
      return updated;
    });
  }, [userId]);

  // Initialize settings with defaults
  useEffect(() => {
    const defaultSettings: Record<string, any> = {};

    Object.values(settingsConfig).forEach((section: any) => {
      section.fields.forEach((field: any) => {
        defaultSettings[field.id] = field.defaultValue;
      });
    });

    // Load from localStorage
    const saved = localStorage.getItem(`settings_${user?.id}`);
    const loadedSettings = saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings;
    setSettings(loadedSettings);

    // When online, fetch the active event and update the stored event code
    if (navigator.onLine) {
      getActiveEvent().then((event) => {
        if (event?.event_code) {
          // Merge into whatever the *current* settings are, not the
          // mount-time snapshot — otherwise this can resolve after some
          // other change (e.g. an equip) and wipe it out.
          setSettings((prev) => {
            const updated = { ...prev, "active-event-code": event.event_code };
            if (user?.id) {
              localStorage.setItem(`settings_${user.id}`, JSON.stringify(updated));
            }
            return updated;
          });
        }
      });

      // The equipped theme cosmetic (synced across devices via the account) is
      // the source of truth for the active theme — resync it over whatever
      // this browser's localStorage last had, so the theme follows the
      // account rather than just the browser it was last set in (or a
      // sandbox theme left over from dev mode).
      void syncThemeFromProfile();
    }
  }, [user?.id, syncThemeFromProfile]);

  // Apply theme class/data-attribute whenever theme setting changes
  useEffect(() => {
    const theme = settings["theme"] ?? "dark";
    const isLightTheme =
      theme === "light" ||
      COSMETICS.some((c) => (c.themeValue === theme && c.isLight) || c.lightThemeValue === theme);
    const html = document.documentElement;
    html.classList.toggle("dark", !isLightTheme);
    html.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [settings["theme"]]);

  const updateSetting = (key: string, value: any) => {
    if (key === "theme") themeVersionRef.current++;
    // Built from the latest settings, so two updates in a row both stick
    setSettings((prev) => {
      const newSettings = { ...prev, [key]: value };
      if (user?.id) {
        localStorage.setItem(`settings_${user.id}`, JSON.stringify(newSettings));
      }
      return newSettings;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, syncThemeFromProfile }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
