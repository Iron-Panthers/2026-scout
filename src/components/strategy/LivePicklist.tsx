import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PicklistCardContent } from "@/components/strategy/PicklistCardContent";
import { getEventPicklists, getPicklistOwnerNames } from "@/lib/picklists";
import { getDevPicklist, isDevEventId } from "@/lib/devMode";
import { supabase } from "@/lib/supabase";
import type { TBATeamSimple } from "@/lib/blueAlliance";
import type { Event } from "@/types";

/** One person's picklist at the event. */
interface SourcePicklist {
  userId: string;
  picked: number[];
  doNotPick: number[];
}

interface LiveEntry {
  teamNumber: number;
  /** Average place across the compiled picklists; null before the first compile. */
  averageRank: number | null;
  /** Placed by hand by the host since the last compile, so it no longer ties with anyone. */
  moved: boolean;
}

/** What the host has done so far, kept in this browser so a reload mid-meeting doesn't lose it. */
interface SavedLiveState {
  selectedIds: string[];
  compiledIds: string[] | null;
  /** The host's hand-arranged list, and the compiled picklists it was arranged from. */
  manual: { entries: LiveEntry[]; signature: string } | null;
}

const CARD_MIN_WIDTH = 200;
const GRID_GAP = 8;

const storageKey = (eventId: string) => `live_picklist:${eventId}`;

function loadSavedState(eventId: string): SavedLiveState | null {
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    return raw ? (JSON.parse(raw) as SavedLiveState) : null;
  } catch {
    return null;
  }
}

/**
 * Each team's place in one person's picklist. Teams they left in Available Teams share the
 * places right after their picklist, and their Do Not Pick teams share the last places.
 */
function personalRanks(source: SourcePicklist, roster: number[]): Map<number, number> {
  const inRoster = new Set(roster);
  const picked = source.picked.filter((team) => inRoster.has(team));
  const pickedSet = new Set(picked);
  const doNotPick = source.doNotPick.filter((team) => inRoster.has(team) && !pickedSet.has(team));
  const doNotPickSet = new Set(doNotPick);
  const unranked = roster.filter((team) => !pickedSet.has(team) && !doNotPickSet.has(team));
  const sharedPlace = (first: number, count: number) => first + (count - 1) / 2;

  const ranks = new Map<number, number>();
  picked.forEach((team, index) => ranks.set(team, index + 1));
  unranked.forEach((team) => ranks.set(team, sharedPlace(picked.length + 1, unranked.length)));
  doNotPick.forEach((team) =>
    ranks.set(team, sharedPlace(picked.length + unranked.length + 1, doNotPick.length))
  );
  return ranks;
}

const byNumber = (roster: number[]): LiveEntry[] =>
  roster.map((teamNumber) => ({ teamNumber, averageRank: null, moved: false }));

function compile(sources: SourcePicklist[], roster: number[]): LiveEntry[] {
  if (sources.length === 0) return byNumber(roster);
  const ranks = sources.map((source) => personalRanks(source, roster));
  return roster
    .map((teamNumber) => ({
      teamNumber,
      averageRank: ranks.reduce((sum, rank) => sum + rank.get(teamNumber)!, 0) / ranks.length,
      moved: false,
    }))
    .sort((a, b) => a.averageRank - b.averageRank || a.teamNumber - b.teamNumber);
}

const isTie = (a: LiveEntry, b: LiveEntry) =>
  !a.moved &&
  !b.moved &&
  a.averageRank != null &&
  b.averageRank != null &&
  Math.abs(a.averageRank - b.averageRank) < 1e-9;

/** Place labels, with tied teams side by side sharing one place ("T3"). */
function rankLabels(entries: LiveEntry[]): { label: string; tied: boolean }[] {
  const labels: { label: string; tied: boolean }[] = [];
  let start = 0;
  while (start < entries.length) {
    let end = start;
    while (end + 1 < entries.length && isTie(entries[end + 1], entries[start])) end++;
    for (let index = start; index <= end; index++) {
      labels.push(end > start ? { label: `T${start + 1}`, tied: true } : { label: `${start + 1}`, tied: false });
    }
    start = end + 1;
  }
  return labels;
}

const formatRank = (rank: number) => String(Math.round(rank * 100) / 100);

function LiveTeamCard({
  team,
  entry,
  rank,
  onClick,
}: {
  team: TBATeamSimple;
  entry: LiveEntry;
  rank: { label: string; tied: boolean };
  onClick: (team: TBATeamSimple) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team.team_number,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="min-w-0 touch-none"
    >
      <Card
        onClick={() => onClick(team)}
        className={`cursor-grab gap-0 py-0 transition-opacity hover:bg-accent/50 active:cursor-grabbing ${
          rank.tied ? "border-l-4 border-l-amber-500" : ""
        } ${isDragging ? "opacity-50" : ""}`}
        title={rank.tied ? "Tied with the teams next to it" : undefined}
      >
        <PicklistCardContent
          team={team}
          showRank
          rankLabel={rank.label}
          detail={
            entry.averageRank != null && (
              <span
                className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground tabular-nums"
                title="Average place across the compiled picklists"
              >
                avg
                <br />
                <span className="text-xs font-semibold text-foreground">{formatRank(entry.averageRank)}</span>
              </span>
            )
          }
        />
      </Card>
    </div>
  );
}

interface LivePicklistProps {
  event: Event;
  /** Every team at the event. */
  teams: TBATeamSimple[];
  userId: string;
  devMode: boolean;
  onExit: () => void;
  onTeamClick: (team: TBATeamSimple) => void;
}

/**
 * The picklist host's live picklist: every team at the event in one list that snakes down
 * the screen, averaged from the picklists the host picks and updated as people change them.
 */
export function LivePicklist({ event, teams, userId, devMode, onExit, onTeamClick }: LivePicklistProps) {
  const isSandbox = devMode && isDevEventId(event.id);
  const [saved] = useState(() => loadSavedState(event.id));
  const [remotePicklists, setRemotePicklists] = useState<SourcePicklist[]>([]);
  const [remoteNames, setRemoteNames] = useState<Map<string, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<string[]>(saved?.selectedIds ?? []);
  const [compiledIds, setCompiledIds] = useState<string[] | null>(saved?.compiledIds ?? null);
  const [manual, setManual] = useState<SavedLiveState["manual"]>(saved?.manual ?? null);
  const [activeTeamNumber, setActiveTeamNumber] = useState<number | null>(null);
  const [columns, setColumns] = useState(1);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // The sandbox only has this user's own picklist.
  const sandboxPicklists = useMemo(() => {
    if (!isSandbox) return [];
    const own = getDevPicklist(userId, event.id);
    return own ? [{ userId, picked: own.picked_team_numbers, doNotPick: own.do_not_pick_team_numbers }] : [];
  }, [isSandbox, userId, event.id]);
  const picklists = isSandbox ? sandboxPicklists : remotePicklists;
  const names = useMemo(
    () => (isSandbox ? new Map([[userId, "You"]]) : remoteNames),
    [isSandbox, userId, remoteNames]
  );

  // Everyone's picklists, refetched whenever one of them changes.
  useEffect(() => {
    if (isSandbox) return;

    let cancelled = false;
    const load = async () => {
      const rows = await getEventPicklists(event.id);
      if (cancelled) return;
      setRemotePicklists(
        rows.map((row) => ({
          userId: row.user_id,
          picked: row.picked_team_numbers,
          doNotPick: row.do_not_pick_team_numbers,
        }))
      );
    };
    void load();
    const channel = supabase
      .channel(`live-picklist-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picklists", filter: `event_id=eq.${event.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [event.id, userId, isSandbox]);

  const ownerIds = useMemo(() => picklists.map((picklist) => picklist.userId).sort().join(","), [picklists]);
  useEffect(() => {
    if (isSandbox || !ownerIds) return;
    let cancelled = false;
    getPicklistOwnerNames(ownerIds.split(",")).then((map) => {
      if (!cancelled) setRemoteNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerIds, isSandbox]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(event.id), JSON.stringify({ selectedIds, compiledIds, manual }));
    } catch {
      /* private window or full storage: the list just won't survive a reload */
    }
  }, [event.id, selectedIds, compiledIds, manual]);

  // Snakes top to bottom, then on to the next column, with as many columns as fit.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver(([entry]) => {
      setColumns(Math.max(1, Math.floor((entry.contentRect.width + GRID_GAP) / (CARD_MIN_WIDTH + GRID_GAP))));
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const teamsByNumber = useMemo(() => new Map(teams.map((team) => [team.team_number, team])), [teams]);
  const roster = useMemo(() => teams.map((team) => team.team_number).sort((a, b) => a - b), [teams]);
  // Only people who've actually sorted some teams have a picklist worth averaging.
  const choices = useMemo(
    () =>
      picklists
        .filter((picklist) => picklist.picked.length + picklist.doNotPick.length > 0)
        .sort((a, b) => (names.get(a.userId) ?? "").localeCompare(names.get(b.userId) ?? "")),
    [picklists, names]
  );

  const compiledSources = useMemo(
    () => (compiledIds ? picklists.filter((picklist) => compiledIds.includes(picklist.userId)) : []),
    [picklists, compiledIds]
  );
  const compiledSignature = useMemo(() => JSON.stringify(compiledSources), [compiledSources]);
  const compiledEntries = useMemo(
    () => (compiledIds ? compile(compiledSources, roster) : byNumber(roster)),
    [compiledIds, compiledSources, roster]
  );

  // The host's own arrangement wins until they compile again. Teams that weren't in the
  // roster when it was made go at the end, and ones no longer at the event drop out.
  const entries = useMemo(() => {
    if (!manual) return compiledEntries;
    const kept = manual.entries.filter((entry) => teamsByNumber.has(entry.teamNumber));
    const keptNumbers = new Set(kept.map((entry) => entry.teamNumber));
    return [...kept, ...compiledEntries.filter((entry) => !keptNumbers.has(entry.teamNumber))];
  }, [manual, compiledEntries, teamsByNumber]);
  const labels = useMemo(() => rankLabels(entries), [entries]);
  const entryIds = useMemo(() => entries.map((entry) => entry.teamNumber), [entries]);
  // Someone changed a compiled picklist after the host started arranging by hand.
  const updatesWaiting = manual != null && compiledIds != null && manual.signature !== compiledSignature;

  const handleCompile = () => {
    setCompiledIds(selectedIds.filter((id) => choices.some((choice) => choice.userId === id)));
    setManual(null);
  };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = (dragEvent: DragStartEvent) => setActiveTeamNumber(Number(dragEvent.active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTeamNumber(null);
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((entry) => entry.teamNumber === Number(active.id));
    const to = entries.findIndex((entry) => entry.teamNumber === Number(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(entries, from, to).map((entry, index) =>
      index === to ? { ...entry, moved: true } : entry
    );
    setManual({ entries: next, signature: manual?.signature ?? compiledSignature });
  };

  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const activeTeam = activeTeamNumber != null ? teamsByNumber.get(activeTeamNumber) : undefined;
  const compiledCount = compiledIds?.length ?? 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="gap-1.5" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" />
          Picklist
        </Button>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          {compiledCount > 0
            ? `Live · averaging ${compiledCount} picklist${compiledCount === 1 ? "" : "s"}`
            : "Live · sorted by team number"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <Users className="h-4 w-4" />
                Picklists{selectedIds.length > 0 && ` (${selectedIds.length})`}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
              <DropdownMenuLabel>Picklists to average</DropdownMenuLabel>
              {choices.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">Nobody has made a picklist yet.</p>
              ) : (
                <>
                  <DropdownMenuItem
                    onSelect={(selectEvent) => {
                      selectEvent.preventDefault();
                      setSelectedIds(
                        selectedIds.length === choices.length ? [] : choices.map((choice) => choice.userId)
                      );
                    }}
                  >
                    {selectedIds.length === choices.length ? "Clear all" : "Select all"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {choices.map((choice) => (
                    <DropdownMenuCheckboxItem
                      key={choice.userId}
                      checked={selectedIds.includes(choice.userId)}
                      onCheckedChange={(checked) => toggleSelected(choice.userId, checked === true)}
                      onSelect={(selectEvent) => selectEvent.preventDefault()}
                    >
                      <span className="min-w-0 flex-1 truncate">{names.get(choice.userId) ?? "Unknown"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{choice.picked.length} picked</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="relative" disabled={selectedIds.length === 0} onClick={handleCompile}>
            Compile
            {updatesWaiting && (
              <span
                className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-red-500"
                aria-label="Picklists have changed since you rearranged"
              />
            )}
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {updatesWaiting
          ? "Some picklists changed since you rearranged the list. Compile again to bring the changes in."
          : "Each team's place is its average across the chosen picklists. Teams someone didn't rank share the places after their picklist, and their Do Not Pick teams share the last places. Tied teams share a place (T) and are marked in amber."}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entryIds} strategy={rectSortingStrategy}>
          <div
            ref={gridRef}
            className="grid gap-2"
            style={{
              gridAutoFlow: "column",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, auto)`,
            }}
          >
            {entries.map((entry, index) => {
              const team = teamsByNumber.get(entry.teamNumber);
              return team ? (
                <LiveTeamCard key={entry.teamNumber} team={team} entry={entry} rank={labels[index]} onClick={onTeamClick} />
              ) : null;
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeTeam ? (
            <Card className="cursor-grabbing gap-0 py-0 shadow-lg">
              <PicklistCardContent team={activeTeam} />
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
