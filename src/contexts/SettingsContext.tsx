import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import settingsConfig from "@/config/settings.json";
import { getActiveEvent } from "@/lib/matches";

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
          const updated = { ...loadedSettings, "active-event-code": event.event_code };
          setSettings(updated);
          if (user?.id) {
            localStorage.setItem(`settings_${user.id}`, JSON.stringify(updated));
          }
        }
      });
    }
  }, [user?.id]);

  // Apply theme class/data-attribute whenever theme setting changes
  useEffect(() => {
    const theme = settings["theme"] ?? "dark";
    const html = document.documentElement;
    html.classList.toggle("dark", theme === "dark" || theme === "ben");
    html.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [settings["theme"]]);

  const updateSetting = (key: string, value: any) => {
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
