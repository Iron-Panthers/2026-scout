import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { AUTO_SHOTS_END } from "@/lib/useMatchTimer";

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

// Auto shots are the first 23s (auto plus the handoff pause, see AUTO_SHOTS_END); everything
// after is teleop, which ends at 2:40.
const MATCH_END = 160;

const INPUT_CLASS =
  "flex-1 min-w-0 bg-background border border-border rounded px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/80";

/** The scouting data's top-level `shots` list of times. */
const isShotTimes = (key: string, value: unknown, path: (string | number)[]): value is number[] =>
  path.length === 0 && key === "shots" && Array.isArray(value) && value.every((item) => typeof item === "number");

/** A whole-number count, which can be cleared while typing a new one. */
function CountInput({ label, count, onChange }: { label: string; count: number; onChange: (count: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-3">
      <span className="font-mono text-xs text-muted-foreground min-w-[140px] shrink-0 select-none">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        className={INPUT_CLASS}
        value={draft ?? String(count)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (/^\d+$/.test(e.target.value)) onChange(Number(e.target.value));
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

/**
 * Shot times as two counts, auto and teleop. Fewer auto shots drops the earliest ones and
 * fewer teleop shots the latest; more adds them at the start of the match or at 2:40.
 */
function ShotsEditor({ value, onChange }: { value: number[]; onChange: (newValue: number[]) => void }) {
  const sorted = [...value].sort((a, b) => a - b);
  const auto = sorted.filter((time) => time < AUTO_SHOTS_END);
  const teleop = sorted.filter((time) => time >= AUTO_SHOTS_END);

  const setAuto = (count: number) => {
    const next = count <= auto.length ? auto.slice(auto.length - count) : [...Array(count - auto.length).fill(0), ...auto];
    onChange([...next, ...teleop]);
  };
  const setTeleop = (count: number) => {
    const next = count <= teleop.length ? teleop.slice(0, count) : [...teleop, ...Array(count - teleop.length).fill(MATCH_END)];
    onChange([...auto, ...next]);
  };

  return (
    <div className="space-y-3 pl-4 border-l-2 border-border">
      <CountInput label="auto shots" count={auto.length} onChange={setAuto} />
      <CountInput label="teleop shots" count={teleop.length} onChange={setTeleop} />
    </div>
  );
}

interface RecursiveJsonEditorProps {
  value: unknown;
  onChange: (newValue: unknown) => void;
  path?: (string | number)[];
}

function ArrayEditor({
  value,
  onChange,
  path,
}: {
  value: unknown[];
  onChange: (newValue: unknown) => void;
  path: (string | number)[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(value.length > 20);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    const updated = value.filter((_, i) => !selected.has(i));
    onChange(updated);
    setSelected(new Set());
  }, [selected, value, onChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        // Only fire if no input is focused inside this container
        if (document.activeElement && el.contains(document.activeElement)) {
          const tag = (document.activeElement as HTMLElement).tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
        }
        e.preventDefault();
        deleteSelected();
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [deleteSelected, selected.size]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="space-y-3 pl-4 border-l-2 border-border relative outline-none"
    >
      {value.length > 5 && (
        <div className="absolute -top-7 right-0 flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors font-medium"
              title={`Delete ${selected.size} item${selected.size !== 1 ? "s" : ""}`}
            >
              <Trash2 size={13} />
              <span>{selected.size}</span>
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span>{value.length} items</span>
          </button>
        </div>
      )}
      {!isCollapsed &&
        value.map((item, idx) => {
          const isObjOrArr = typeof item === "object" && item !== null;
          const isSelected = selected.has(idx);
          return (
            <div
              key={idx}
              className={[
                isObjOrArr ? "space-y-1" : "flex items-center gap-3",
                "rounded px-1 cursor-pointer transition-colors",
                isSelected
                  ? "ring-2 ring-destructive bg-destructive/10"
                  : "hover:bg-muted/30",
              ].join(" ")}
              onClick={(e) => {
                // Don't select if clicking on an input/button inside the row
                const target = e.target as HTMLElement;
                if (
                  target.tagName === "INPUT" ||
                  target.tagName === "BUTTON" ||
                  target.tagName === "TEXTAREA"
                )
                  return;
                toggleSelect(idx);
              }}
            >
              {isObjOrArr ? (
                <div className="font-mono text-xs font-medium text-muted-foreground select-none">
                  [{idx}]
                </div>
              ) : (
                <label className="font-mono text-xs text-muted-foreground min-w-[40px] shrink-0 select-none pointer-events-none">
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
      {!isCollapsed && selected.size > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <button
            type="button"
            onClick={deleteSelected}
            className="flex items-center gap-1.5 text-xs bg-destructive text-destructive-foreground rounded px-2 py-1 hover:bg-destructive/80 transition-colors font-medium"
          >
            <Trash2 size={12} />
            Delete {selected.size} item{selected.size !== 1 ? "s" : ""}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
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
            if (isShotTimes(key, val, path)) {
              return (
                <div key={key} className="space-y-1">
                  <div className="font-mono text-xs font-medium text-muted-foreground select-none pt-1">{key}</div>
                  <ShotsEditor
                    value={val}
                    onChange={(newVal) => onChange({ ...(value as Record<string, unknown>), [key]: newVal })}
                  />
                </div>
              );
            }
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
    return <ArrayEditor value={value} onChange={onChange} path={path} />;
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
