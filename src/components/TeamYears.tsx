import { useState } from "react";
import { Pencil, Save, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRENT_YEAR } from "@/lib/blueAlliance";

/** Earliest season offered when picking years on the team. */
const FIRST_YEAR = 2014;

/** "2019, 2022–2026": consecutive seasons collapse into a range. */
function formatTeamYears(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}–${sorted[i]}`);
  }
  return parts.join(", ");
}

interface TeamYearsProps {
  years: number[];
  /** Shown only on your own profile; saves the new list, resolving false if it failed. */
  onSave?: (years: number[]) => Promise<boolean>;
}

/** The seasons someone was on the team: a line of text, with year toggles to edit your own. */
export function TeamYears({ years, onSave }: TeamYearsProps) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const seasons = Array.from({ length: CURRENT_YEAR - FIRST_YEAR + 1 }, (_, i) => CURRENT_YEAR - i);

  const startEditing = () => {
    setPicked(new Set(years));
    setEditing(true);
  };

  const toggle = (year: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    const ok = await onSave([...picked].sort((a, b) => a - b));
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Which seasons were you on the team?</p>
        <div className="flex flex-wrap justify-center gap-1.5 md:justify-start">
          {seasons.map((year) => (
            <Button
              key={year}
              type="button"
              size="sm"
              variant={picked.has(year) ? "default" : "outline"}
              className="h-7 px-2.5 text-xs tabular-nums"
              aria-pressed={picked.has(year)}
              onClick={() => toggle(year)}
            >
              {year}
            </Button>
          ))}
        </div>
        <div className="flex justify-center gap-2 md:justify-start">
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="h-4 w-4" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5">
            <X className="h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 text-muted-foreground md:justify-start">
      <Users className="h-4 w-4 shrink-0" />
      <span className="text-sm">
        {years.length > 0 ? `On the team: ${formatTeamYears(years)}` : onSave ? "Add the years you were on the team" : "Team years not set"}
      </span>
      {onSave && (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={startEditing} aria-label="Edit years on the team">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
