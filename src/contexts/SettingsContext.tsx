import { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import settingsConfig from "@/config/settings.json";
import { getActiveEvent } from "@/lib/matches";
import { getGameProfile } from "@/lib/gameProfiles";
import { COSMETICS } from "@/config/cosmetics";

interface SettingsContextType {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  // Tracks whether the user has explicitly changed the theme locally (e.g.
  // by equipping one) since this provider mounted. The background fetch
  // below resyncs the theme from the account on load, but it can resolve
  // *after* a live equip — without this guard it would silently clobber the
  // just-equipped theme back to whatever it read before the equip happened.
  const userChangedThemeRef = useRef(false);

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
      // account rather than just the browser it was last set in.
      if (user?.id) {
        getGameProfile(user.id).then((gameProfile) => {
          // The user already equipped/unequipped a theme locally while this
          // fetch was in flight — their live action wins, don't overwrite it.
          if (userChangedThemeRef.current) return;
          const equippedThemeId = gameProfile?.equipped_cosmetics?.["theme"];
          const themeValue = equippedThemeId
            ? COSMETICS.find((c) => c.id === equippedThemeId)?.themeValue
            : undefined;
          if (themeValue) {
            setSettings((prev) => {
              const updated = { ...prev, theme: themeValue };
              localStorage.setItem(`settings_${user.id}`, JSON.stringify(updated));
              return updated;
            });
          }
        });
      }
    }
  }, [user?.id]);

  // Apply theme class/data-attribute whenever theme setting changes
  useEffect(() => {
    const theme = settings["theme"] ?? "dark";
    const isLightTheme = theme === "light" || COSMETICS.some((c) => c.themeValue === theme && c.isLight);
    const html = document.documentElement;
    html.classList.toggle("dark", !isLightTheme);
    html.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [settings["theme"]]);

  const updateSetting = (key: string, value: any) => {
    if (key === "theme") userChangedThemeRef.current = true;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    if (user?.id) {
      localStorage.setItem(`settings_${user.id}`, JSON.stringify(newSettings));
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
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
