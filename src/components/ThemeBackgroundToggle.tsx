import { Moon, Sun } from "lucide-react";
import type { ThemeBackground } from "@/config/cosmetics";

/** Light/Dark switch for themes that come with both backgrounds. */
export function ThemeBackgroundToggle({
  value,
  onChange,
  className = "",
}: {
  value: ThemeBackground;
  onChange: (value: ThemeBackground) => void;
  className?: string;
}) {
  const options: { value: ThemeBackground; label: string; icon: typeof Sun }[] = [
    { value: "dark", label: "Dark", icon: Moon },
    { value: "light", label: "Light", icon: Sun },
  ];
  return (
    <div role="radiogroup" aria-label="Theme background" className={`flex rounded-md border border-border p-0.5 ${className}`}>
      {options.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            value === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3 w-3" />
          {label}
        </button>
      ))}
    </div>
  );
}
