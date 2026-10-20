import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getEventsForYear, type TBAEventSimple } from "@/lib/blueAlliance";
import {
  addEvents,
  getAddedEvents,
  removeAddedEvent,
  setAddedEventMatches,
  setScoutingManager,
  type AddedEvent,
  type ScoutedEvent,
} from "@/lib/scoutingHistory";

const MAX_MATCHES = 500;

/** "" → null; anything else → a whole number from 0 to MAX_MATCHES. */
function parseMatches(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_MATCHES, Math.max(0, n)) : null;
}

/** A small "matches scouted" number box. */
function MatchesInput({ value, onChange, onBlur }: { value: string; onChange: (value: string) => void; onBlur?: () => void }) {
  return (
    // Inside a clickable event row: don't let clicks here tick/untick the row's checkbox
    <div
      className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_MATCHES}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="—"
        className="h-7 w-16 px-2 text-sm tabular-nums"
        aria-label="Matches scouted"
      />
      matches
    </div>
  );
}

/** A small "Scouting manager" checkbox. */
function ManagerToggle({ checked, onChange, disabled, title }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; title?: string }) {
  return (
    // Inside a clickable event row: don't let clicks here tick/untick the row's own checkbox
    <div
      className={`flex shrink-0 items-center gap-1.5 text-xs ${disabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
    >
      <Checkbox checked={checked} disabled={disabled} aria-label="Scouting manager" className="h-3.5 w-3.5" />
      Manager
    </div>
  );
}

function formatDates(start: string, end: string | null): string {
  const day = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return end && end !== start ? `${day(start)} – ${day(end)}` : day(start);
}

interface AddEventsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Seasons they were on the team: the only years they can add events from. */
  teamYears: number[];
  /** Every event on their map (recorded or added): can't be added again, and can be marked as managed. */
  mapEvents: ScoutedEvent[];
  /** After events are added, removed or changed, so the map can reload. */
  onChanged: () => void;
}

/**
 * Lets a scouter fix their map: add events they attended or scouted at that the app has
 * no record of, picked from The Blue Alliance's list for each season they were on the
 * team, say how many matches they scouted there, mark the competitions they were a
 * scouting manager at, and remove ones they added.
 */
export function AddEventsDialog({ open, onOpenChange, userId, teamYears, mapEvents, onChanged }: AddEventsDialogProps) {
  const { toast } = useToast();
  const years = useMemo(() => [...teamYears].sort((a, b) => b - a), [teamYears]);
  const [year, setYear] = useState<number | null>(null);
  const [events, setEvents] = useState<TBAEventSimple[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, TBAEventSimple>>(new Map());
  // Matches scouted typed in for each picked event, and edits to ones added before
  const [pickedMatches, setPickedMatches] = useState<Record<string, string>>({});
  const [addedMatches, setAddedMatches] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<AddedEvent[]>([]);
  const [saving, setSaving] = useState(false);
  // "Scouting manager" ticks on events being added, and changes made here to ones on the map
  const [pickedManager, setPickedManager] = useState<Set<string>>(new Set());
  const [managerChanges, setManagerChanges] = useState<Record<string, boolean>>({});

  const onMapCodes = useMemo(
    () => new Set(mapEvents.map((event) => event.eventCode).filter((code): code is string => !!code)),
    [mapEvents]
  );
  const yearOf = (code: string) => Number(code.slice(0, 4));
  const isManager = (event: ScoutedEvent) =>
    event.eventCode ? managerChanges[event.eventCode] ?? !!event.scoutingManager : false;

  const selectedYear = year !== null && years.includes(year) ? year : years[0] ?? null;

  // Events they've added before, each time the dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAddedEvents(userId).then((list) => {
      if (cancelled) return;
      setAdded(list);
      setAddedMatches(Object.fromEntries(list.map((event) => [event.event_code, event.matches_scouted?.toString() ?? ""])));
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  // The chosen season's events
  useEffect(() => {
    if (!open || selectedYear === null) return;
    let cancelled = false;
    setLoadingEvents(true); // eslint-disable-line react-hooks/set-state-in-effect
    getEventsForYear(selectedYear).then((list) => {
      if (cancelled) return;
      setEvents(list);
      setLoadingEvents(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedYear]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) =>
      [event.name, event.key, event.city, event.state_prov].some((field) => field?.toLowerCase().includes(query))
    );
  }, [events, search]);

  const togglePick = (event: TBAEventSimple) =>
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(event.key)) next.delete(event.key);
      else next.set(event.key, event);
      return next;
    });

  async function addPicked() {
    // Only events from their team years (the database enforces this too)
    const toAdd = [...picked.values()].filter((event) => teamYears.includes(Number(event.start_date.slice(0, 4))));
    setSaving(true);
    const ok = await addEvents(
      userId,
      toAdd.map((event) => ({
        event_code: event.key,
        event_name: event.name,
        start_date: event.start_date,
        end_date: event.end_date,
        matches_scouted: parseMatches(pickedMatches[event.key] ?? ""),
      }))
    );
    setSaving(false);
    if (!ok) {
      toast({ title: "Couldn't add those events", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    // ...and mark the ones they managed
    const managed = toAdd.filter((event) => pickedManager.has(event.key));
    const marked = await Promise.all(managed.map((event) => setScoutingManager(userId, event.key, true)));
    if (marked.includes(false)) toast({ title: "Couldn't mark every event as managed", variant: "destructive" });
    toast({ title: `Added ${toAdd.length} event${toAdd.length === 1 ? "" : "s"} to your map` });
    setPicked(new Map());
    setPickedMatches({});
    setPickedManager(new Set());
    const list = await getAddedEvents(userId);
    setAdded(list);
    setAddedMatches(Object.fromEntries(list.map((event) => [event.event_code, event.matches_scouted?.toString() ?? ""])));
    onChanged();
  }

  /** Saves an edited match count for an event added before (on leaving the box). */
  async function saveAddedMatches(event: AddedEvent) {
    const matches = parseMatches(addedMatches[event.event_code] ?? "");
    if (matches === event.matches_scouted) return;
    if (!(await setAddedEventMatches(userId, event.event_code, matches))) {
      toast({ title: "Couldn't save the match count", variant: "destructive" });
      return;
    }
    setAdded((current) => current.map((e) => (e.event_code === event.event_code ? { ...e, matches_scouted: matches } : e)));
    setAddedMatches((current) => ({ ...current, [event.event_code]: matches?.toString() ?? "" }));
    onChanged();
  }

  async function toggleManager(eventCode: string, manager: boolean) {
    setManagerChanges((current) => ({ ...current, [eventCode]: manager }));
    if (!(await setScoutingManager(userId, eventCode, manager))) {
      setManagerChanges((current) => ({ ...current, [eventCode]: !manager }));
      toast({ title: "Couldn't update that event", variant: "destructive" });
      return;
    }
    onChanged();
  }

  async function remove(eventCode: string) {
    if (!(await removeAddedEvent(userId, eventCode))) {
      toast({ title: "Couldn't remove that event", variant: "destructive" });
      return;
    }
    setAdded((current) => current.filter((event) => event.event_code !== eventCode));
    onChanged();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setPicked(new Map());
          setPickedMatches({});
          setPickedManager(new Set());
          setManagerChanges({});
          setSearch("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-[95vw] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Missing an event?</DialogTitle>
          <DialogDescription>
            Add events you attended or scouted at that aren't on your map, and mark the ones you were a scouting manager at.
            Only seasons you were on the team count.
          </DialogDescription>
        </DialogHeader>

        {years.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            First set the years you were on the team (the "On the team" line on your profile), then come back to add events from those seasons.
          </p>
        ) : (
          // Scrolls as a whole, so the lists can't push past the bottom of the popup
          <div className="-mr-2 flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
            {/* Season */}
            <div className="flex flex-wrap gap-1.5">
              {years.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={option === selectedYear ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs tabular-nums"
                  onClick={() => setYear(option)}
                >
                  {option}
                </Button>
              ))}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search events or cities" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>

            {/* That season's events */}
            <div className="h-56 shrink-0 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {loadingEvents ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading {selectedYear} events...
                </div>
              ) : visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No events found.</p>
              ) : (
                visible.map((event) => {
                  const onMap = onMapCodes.has(event.key);
                  return (
                    <label
                      key={event.key}
                      className={`flex items-start gap-3 rounded p-2 ${onMap ? "opacity-50" : "cursor-pointer hover:bg-accent/50"}`}
                    >
                      <Checkbox
                        checked={onMap || picked.has(event.key)}
                        disabled={onMap}
                        onCheckedChange={() => togglePick(event)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{event.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[event.city, event.state_prov].filter(Boolean).join(", ") || event.country || "Location unknown"} ·{" "}
                          {formatDates(event.start_date, event.end_date)}
                          {onMap && " · On your map"}
                        </p>
                      </div>
                      {/* How many matches they scouted there, once picked */}
                      {picked.has(event.key) && (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <MatchesInput
                            value={pickedMatches[event.key] ?? ""}
                            onChange={(value) => setPickedMatches((current) => ({ ...current, [event.key]: value }))}
                          />
                          <ManagerToggle
                            checked={pickedManager.has(event.key)}
                            onChange={(checked) =>
                              setPickedManager((current) => {
                                const next = new Set(current);
                                if (checked) next.add(event.key);
                                else next.delete(event.key);
                                return next;
                              })
                            }
                          />
                        </div>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            <Button className="shrink-0" onClick={addPicked} disabled={picked.size === 0 || saving}>
              {saving ? "Adding..." : picked.size > 0 ? `Add ${picked.size} event${picked.size === 1 ? "" : "s"}` : "Pick events to add"}
            </Button>

            {/* Everything on their map: mark managed competitions; edit or remove the ones they added */}
            {mapEvents.some((event) => event.eventCode) && (
              <div className="min-w-0 shrink-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your events</p>
                <div className="space-y-0.5">
                  {mapEvents
                    .filter((event): event is ScoutedEvent & { eventCode: string } => !!event.eventCode)
                    .map((event) => {
                      const code = event.eventCode;
                      const addedEvent = event.addedByScouter ? added.find((e) => e.event_code === code) : undefined;
                      const inTeamYears = teamYears.includes(yearOf(code));
                      return (
                        <div key={event.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded px-2 py-1 text-sm hover:bg-accent/40">
                          <span className="min-w-0 flex-1 truncate">{event.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{yearOf(code) || ""}</span>
                          {addedEvent && (
                            <MatchesInput
                              value={addedMatches[code] ?? ""}
                              onChange={(value) => setAddedMatches((current) => ({ ...current, [code]: value }))}
                              onBlur={() => saveAddedMatches(addedEvent)}
                            />
                          )}
                          <ManagerToggle
                            checked={isManager(event)}
                            onChange={(checked) => toggleManager(code, checked)}
                            disabled={!inTeamYears}
                            title={inTeamYears ? undefined : "Add this season to your years on the team first"}
                          />
                          {addedEvent ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => remove(code)}
                              aria-label={`Remove ${event.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            // Recorded by the app: can't be removed, keeps the row aligned
                            <span className="h-6 w-6 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
