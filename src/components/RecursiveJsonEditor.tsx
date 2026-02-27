import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const PHASE_KEYS = new Set([
  "auto",
  "transition-shift",
  "phase1",
  "phase2",
  "phase3",
  "phase4",
  "endgame",
]);

const isPhaseKey = (k: string) => PHASE_KEYS.has(k);

interface RecursiveJsonEditorProps {
  value: unknown;
  onChange: (newValue: unknown) => void;
  path?: (string | number)[];
}

export function RecursiveJsonEditor({
  value,
  onChange,
  path = [],
}: RecursiveJsonEditorProps) {
  const collectionLength = Array.isArray(value)
    ? value.length
    : typeof value === "object" && value !== null
    ? Object.keys(value as object).length
    : 0;
  const [isCollapsed, setIsCollapsed] = useState(collectionLength > 20);

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);

    return (
      <div className="space-y-3 pl-4 border-l-2 border-border relative">
        {entries.length > 5 && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -top-7 right-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{entries.length} properties</span>
          </button>
        )}
        {!isCollapsed &&
          entries.map(([key, val], idx) => {
            const isPrimitive =
              val === null || ["string", "number", "boolean"].includes(typeof val);
            const isObjOrArr = typeof val === "object" && val !== null;
            return (
              <div key={key} className={isObjOrArr ? "space-y-1" : "flex items-center gap-3"}>
                {isPhaseKey(key) && idx !== 0 && (
                  <div className="my-3 border-t-2 border-primary/60 opacity-80" />
                )}
                {isObjOrArr && (
                  <div className="font-mono text-xs font-medium text-muted-foreground select-none pt-1">
                    {key}
                  </div>
                )}
                {isPrimitive && (
                  <label className="font-mono text-xs text-muted-foreground min-w-[140px] shrink-0 break-all select-none">
                    {key}
                  </label>
                )}
                <RecursiveJsonEditor
                  value={val}
                  onChange={(newVal) => {
                    onChange({ ...(value as Record<string, unknown>), [key]: newVal });
                  }}
                  path={[...path, key]}
                />
              </div>
            );
          })}
      </div>
    );
  } else if (Array.isArray(value)) {
    return (
      <div className="space-y-3 pl-4 border-l-2 border-border relative">
        {value.length > 5 && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -top-7 right-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{value.length} items</span>
          </button>
        )}
        {!isCollapsed &&
          value.map((item, idx) => {
            const isObjOrArr = typeof item === "object" && item !== null;
            return (
              <div key={idx} className={isObjOrArr ? "space-y-1" : "flex items-center gap-3"}>
                {isObjOrArr ? (
                  <div className="font-mono text-xs font-medium text-muted-foreground select-none">
                    [{idx}]
                  </div>
                ) : (
                  <label className="font-mono text-xs text-muted-foreground min-w-[40px] shrink-0 select-none">
                    [{idx}]
                  </label>
                )}
                <RecursiveJsonEditor
                  value={item}
                  onChange={(newVal) => {
                    const updated = value.slice();
                    updated[idx] = newVal;
                    onChange(updated);
                  }}
                  path={[...path, idx]}
                />
              </div>
            );
          })}
      </div>
    );
  } else if (typeof value === "string") {
    return (
      <input
        className="flex-1 min-w-0 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/80"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (typeof value === "number") {
    return (
      <input
        type="number"
        className="flex-1 min-w-0 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/80"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  } else if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-5 h-5 accent-primary"
      />
    );
  } else if (value === null) {
    return <span className="italic text-muted-foreground text-sm">null</span>;
  } else {
    return <span className="italic text-muted-foreground text-sm">[unsupported]</span>;
  }
}
