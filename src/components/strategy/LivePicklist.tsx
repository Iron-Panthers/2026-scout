import { useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Check, ChevronDown, Loader2, MessageCircle, Square, Undo2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { PicklistCardContent } from "@/components/strategy/PicklistCardContent";
import { TeamRankings } from "@/components/strategy/TeamRankings";
import { LiveTeamNoteEditor } from "@/components/strategy/LiveTeamNote";
import { TagFilter, TeamTagEditor, TeamTags } from "@/components/strategy/TeamTag";
import { StatFilterButton } from "@/components/strategy/StatFilter";
import { matchesStatFilter, useTeamStats, type StatFilterValue } from "@/lib/statFilter";
import { TeamInfoDialog } from "@/components/TeamInfoDialog";
import { getEventPicklists, getProfileNames } from "@/lib/picklists";
import {
  getPendingSuggestions,
  publishLivePicklist,
  resolveSuggestion,
  suggestMove,
  type LivePicklistEntry,
  type LivePicklistRow,
  type LivePicklistTag,
  distinctTags,
  entryTags,
  sameTag,
  type LivePicklistSuggestion,
  type SuggestionDirection,
} from "@/lib/livePicklists";
import { unlockAchievement } from "@/lib/achievements";
import { getDevPicklist, isDevEventId } from "@/lib/devMode";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { TBATeamSimple } from "@/lib/blueAlliance";
import type { Event } from "@/types";

/** One person's picklist at the event. */
interface SourcePicklist {
  userId: string;
  picked: number[];
  doNotPick: number[];
}

/** What the host has done so far, kept in this browser so a reload mid-meeting doesn't lose it. */
interface SavedLiveState {
  selectedIds: string[];
  compiledIds: string[] | null;
  /** The host's hand-arranged list, and the compiled picklists it was arranged from. */
  manual: { entries: LivePicklistEntry[]; signature: string } | null;
  /** The host's tags, by team number. (Saved before teams could have several: one tag each.) */
  tags?: Record<number, LivePicklistTag[] | LivePicklistTag>;
  /** The host's live picklist notes, by team number. */
  notes?: Record<number, string>;
  /** Teams the host moved into (true) or out of (false) DNP Teams, by team number. */
  dnpOverrides?: Record<number, boolean>;
}

type RankLabel = { label: string; tied: boolean };

interface LiveMenuItem {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

/** Columns at each window width, matching the Event page's grid (Tailwind's sm, md and lg). */
const columnsForWidth = (width: number) => (width >= 1024 ? 5 : width >= 768 ? 4 : width >= 640 ? 3 : 2);

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

const byNumber = (roster: number[]): LivePicklistEntry[] =>
  roster.map((teamNumber) => ({ teamNumber, averageRank: null, moved: false }));

function compile(sources: SourcePicklist[], roster: number[]): LivePicklistEntry[] {
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

const isTie = (a: LivePicklistEntry, b: LivePicklistEntry) =>
  !a.moved &&
  !b.moved &&
  a.averageRank != null &&
  b.averageRank != null &&
  Math.abs(a.averageRank - b.averageRank) < 1e-9;

/** Two teams next to each other share a place: the same average, or tied by the host. */
const tiedWith = (a: LivePicklistEntry, b: LivePicklistEntry) =>
  (a.tieGroup != null && a.tieGroup === b.tieGroup) || isTie(a, b);

/** Place labels, with tied teams side by side sharing one place (both "3", marked `tied`). */
function rankLabels(entries: LivePicklistEntry[]): RankLabel[] {
  const labels: RankLabel[] = [];
  let start = 0;
  while (start < entries.length) {
    let end = start;
    while (end + 1 < entries.length && tiedWith(entries[end], entries[end + 1])) end++;
    for (let index = start; index <= end; index++) {
      labels.push({ label: `${start + 1}`, tied: end > start });
    }
    start = end + 1;
  }
  return labels;
}

const formatRank = (rank: number) => String(Math.round(rank * 100) / 100);

const isDnpMove = (direction: SuggestionDirection) => direction === "to_dnp" || direction === "from_dnp";

/** "move 254 up 3 spots", "move 254 up" when no number was given, or "move 254 to DNP Teams". */
const describeMove = (suggestion: Pick<LivePicklistSuggestion, "team_number" | "direction" | "spots">) => {
  if (suggestion.direction === "to_dnp") return `move ${suggestion.team_number} to DNP Teams`;
  if (suggestion.direction === "from_dnp") return `move ${suggestion.team_number} out of DNP Teams`;
  return `move ${suggestion.team_number} ${suggestion.direction}${
    suggestion.spots ? ` ${suggestion.spots} spot${suggestion.spots === 1 ? "" : "s"}` : ""
  }`;
};

/** Marks a move into DNP Teams. */
function DnpMark({ className = "" }: { className?: string }) {
  return <span className={`shrink-0 font-bold ${className}`}>DNP</span>;
}

function SuggestionIcon({ direction }: { direction: SuggestionDirection }) {
  if (direction === "up") return <ArrowUp className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (direction === "down") return <ArrowDown className="h-4 w-4 shrink-0 text-red-600" />;
  if (direction === "to_dnp") return <DnpMark className="text-[10px] leading-4 text-red-600" />;
  return <Undo2 className="h-4 w-4 shrink-0 text-emerald-600" />;
}

/** For the host: moves a team into or out of DNP Teams, with how many people DNP'd it. */
function DnpButton({
  dnp,
  listedCount,
  moved,
  onChange,
}: {
  dnp: boolean;
  /** How many people have it on their Do Not Pick list. */
  listedCount: number;
  /** The host moved it, so it's not where everyone's lists put it. */
  moved: boolean;
  onChange: (dnp: boolean) => void;
}) {
  // Only said for teams taken out of DNP Teams, not ones put in it
  const showMoved = moved && !dnp;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-foreground/40 dark:border-foreground/40"
        onClick={() => onChange(!dnp)}
      >
        {dnp ? <Undo2 className="h-3.5 w-3.5" /> : <DnpMark className="text-sm" />}
        {dnp ? "Move out of DNP" : ""}
      </Button>
      {(listedCount > 0 || showMoved) && (
        <p className="text-right text-[11px] text-muted-foreground">
          {listedCount > 0 && `On ${listedCount} DNP list${listedCount === 1 ? "" : "s"}`}
          {listedCount > 0 && showMoved && " · "}
          {showMoved && (listedCount > 0 ? "moved by you" : "Moved by you")}
        </p>
      )}
    </div>
  );
}

function LiveStatus() {
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      Live
    </span>
  );
}

/** Switches the list between the main picklist and the teams on anyone's Do Not Pick list. */
function DnpToggle({ checked, onChange, count }: { checked: boolean; onChange: (checked: boolean) => void; count: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium">
      <Switch checked={checked} onCheckedChange={onChange} />
      DNP Teams
      <span className="text-xs text-muted-foreground tabular-nums">({count})</span>
    </label>
  );
}

function LiveTeamCard({
  team,
  entry,
  rank,
  editable,
  suggestionCount,
  onClick,
  onSuggest,
  onContextMenu,
  faded,
}: {
  team: TBATeamSimple;
  entry: LivePicklistEntry;
  rank: RankLabel;
  editable: boolean;
  suggestionCount?: number;
  onClick: (team: TBATeamSimple) => void;
  onSuggest?: (team: TBATeamSimple) => void;
  /** Right-click, with where it happened (for the host's menu). */
  onContextMenu?: (teamNumber: number, x: number, y: number) => void;
  /** Left out by the tag filter, so it's nearly see-through. */
  faded?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team.team_number,
    disabled: !editable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`h-full min-w-0 ${editable ? "touch-none" : ""}`}
    >
      <Card
        onClick={() => onClick(team)}
        onContextMenu={
          onContextMenu &&
          ((menuEvent) => {
            menuEvent.preventDefault();
            onContextMenu(team.team_number, menuEvent.clientX, menuEvent.clientY);
          })
        }
        className={`h-full gap-0 py-0 transition-opacity hover:bg-accent/50 ${
          editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${rank.tied ? "border-l-4 border-l-amber-500" : ""} ${isDragging ? "opacity-50" : faded ? "opacity-20" : ""}`}
        title={rank.tied ? "Tied with the teams next to it" : undefined}
      >
        <PicklistCardContent
          team={team}
          className="min-h-20 flex-1 py-3"
          showRank
          rankLabel={rank.label}
          below={entryTags(entry).length > 0 && <TeamTags tags={entryTags(entry)} dots />}
          detail={
            <>
              {!!suggestionCount && (
                <span
                  className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                  title={`${suggestionCount} suggestion${suggestionCount === 1 ? "" : "s"} waiting`}
                >
                  <MessageCircle className="h-3 w-3" />
                  {suggestionCount}
                </span>
              )}
              {entry.averageRank != null && (
                <span
                  className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground tabular-nums"
                  title="Average place across the compiled picklists"
                >
                  avg
                  <br />
                  <span className="text-xs font-semibold text-foreground">{formatRank(entry.averageRank)}</span>
                </span>
              )}
              {onSuggest && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                  aria-label={`Suggest a move for team ${team.team_number}`}
                  title="Suggest a move"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onSuggest(team);
                  }}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              )}
            </>
          }
        />
      </Card>
    </div>
  );
}

/**
 * Every team in one list that snakes down the screen: top to bottom, then on to the next
 * column, with as many columns as fit. Only the host's copy can be dragged.
 */
function LiveGrid({
  entries,
  teamsByNumber,
  editable,
  suggestionCounts,
  onReorder,
  onTeamClick,
  onSuggest,
  menuItems,
  tagFilter,
  statMatches,
  emptyMessage,
}: {
  entries: LivePicklistEntry[];
  teamsByNumber: Map<number, TBATeamSimple>;
  editable: boolean;
  suggestionCounts?: Map<number, number>;
  /** Moves a team to where another team is. */
  onReorder?: (teamNumber: number, overTeamNumber: number) => void;
  onTeamClick: (team: TBATeamSimple) => void;
  onSuggest?: (team: TBATeamSimple) => void;
  /** The host's right-click menu for a team. */
  menuItems?: (teamNumber: number) => LiveMenuItem[];
  /** Fades every team that doesn't have all of these tags (when there are any). */
  tagFilter?: LivePicklistTag[];
  /** Whether a team fits the stat filter; teams that don't are faded. */
  statMatches?: (teamNumber: number) => boolean;
  emptyMessage?: string;
}) {
  const [activeTeamNumber, setActiveTeamNumber] = useState<number | null>(null);
  // The team whose right-click menu is open, and where it opened
  const [menu, setMenu] = useState<{ teamNumber: number; x: number; y: number } | null>(null);
  const [columns, setColumns] = useState(() => columnsForWidth(window.innerWidth));

  // From the window's width, like the Event page's breakpoints, so the scrollbar coming or
  // going as the list reflows can't change the column count.
  useEffect(() => {
    const update = () => setColumns(columnsForWidth(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const visible = useMemo(() => entries.filter((entry) => teamsByNumber.has(entry.teamNumber)), [entries, teamsByNumber]);
  const labels = useMemo(() => rankLabels(visible), [visible]);
  const ids = useMemo(() => visible.map((entry) => entry.teamNumber), [visible]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = (dragEvent: DragStartEvent) => setActiveTeamNumber(Number(dragEvent.active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTeamNumber(null);
    if (!over || active.id === over.id) return;
    onReorder?.(Number(active.id), Number(over.id));
  };

  const rows = Math.max(1, Math.ceil(visible.length / columns));
  const activeTeam = activeTeamNumber != null ? teamsByNumber.get(activeTeamNumber) : undefined;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {visible.length === 0 && emptyMessage && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </Card>
        )}
        <div
          className="grid gap-2"
          style={{
            gridAutoFlow: "column",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, auto)`,
          }}
        >
          {visible.map((entry, index) => (
            <LiveTeamCard
              key={entry.teamNumber}
              team={teamsByNumber.get(entry.teamNumber)!}
              entry={entry}
              rank={labels[index]}
              editable={editable}
              suggestionCount={suggestionCounts?.get(entry.teamNumber)}
              onClick={onTeamClick}
              onSuggest={onSuggest}
              onContextMenu={menuItems && ((teamNumber, x, y) => setMenu({ teamNumber, x, y }))}
              faded={
                (!!tagFilter?.length && !tagFilter.every((chosen) => entryTags(entry).some((tag) => sameTag(tag, chosen)))) ||
                (!!statMatches && !statMatches(entry.teamNumber))
              }
            />
          ))}
        </div>
      </SortableContext>
      {menuItems && (
        <DropdownMenu open={menu != null} onOpenChange={(open) => !open && setMenu(null)}>
          {/* An invisible anchor at the pointer, so the menu opens where they right-clicked */}
          <DropdownMenuTrigger asChild>
            <span aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {menu && (
              <>
                <DropdownMenuLabel>Team {menu.teamNumber}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menuItems(menu.teamNumber).map((item) => (
                  <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={item.onSelect}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DragOverlay dropAnimation={null}>
        {activeTeam ? (
          <Card className="cursor-grabbing gap-0 py-0 shadow-lg">
            <PicklistCardContent team={activeTeam} className="min-h-20 py-3" />
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface LivePicklistProps {
  event: Event;
  /** Every team at the event. */
  teams: TBATeamSimple[];
  userId: string;
  userName: string | null;
  devMode: boolean;
  onExit: () => void;
  onEnd: () => void;
}

/**
 * The picklist host's live picklist, averaged from the picklists the host picks and updated
 * as people change them. Everything the host does is shared so others can watch and suggest.
 */
export function LivePicklist({ event, teams, userId, userName, devMode, onExit, onEnd }: LivePicklistProps) {
  const isSandbox = devMode && isDevEventId(event.id);
  const { toast } = useToast();
  const [saved] = useState(() => loadSavedState(event.id));
  const [remotePicklists, setRemotePicklists] = useState<SourcePicklist[]>([]);
  const [remoteNames, setRemoteNames] = useState<Map<string, string>>(new Map());
  const [suggestions, setSuggestions] = useState<LivePicklistSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(saved?.selectedIds ?? []);
  const [compiledIds, setCompiledIds] = useState<string[] | null>(saved?.compiledIds ?? null);
  const [manual, setManual] = useState<SavedLiveState["manual"]>(saved?.manual ?? null);
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [showDnp, setShowDnp] = useState(false);
  const [tags, setTags] = useState<Record<number, LivePicklistTag[]>>(() =>
    Object.fromEntries(
      Object.entries(saved?.tags ?? {}).map(([team, value]) => [team, Array.isArray(value) ? value : [value]])
    )
  );
  const existingTags = useMemo(() => distinctTags(Object.values(tags)), [tags]);
  // The tag filter's choices, each dropped once nobody has that tag any more
  const [tagFilter, setTagFilter] = useState<LivePicklistTag[]>([]);
  const activeTagFilter = tagFilter.filter((chosen) => existingTags.some((tag) => sameTag(tag, chosen)));
  const teamStats = useTeamStats(event, isSandbox ? { userId, userName } : null);
  const [statFilter, setStatFilter] = useState<StatFilterValue | null>(null);
  const statMatches =
    statFilter && teamStats ? (teamNumber: number) => matchesStatFilter(teamStats.get(teamNumber), statFilter) : undefined;
  const [notes, setNotes] = useState<Record<number, string>>(() => saved?.notes ?? {});
  const [dnpOverrides, setDnpOverrides] = useState<Record<number, boolean>>(() => saved?.dnpOverrides ?? {});
  // The team whose info popup is open (kept while it closes, so it doesn't blank mid-animation)
  const [infoTeam, setInfoTeam] = useState<number | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // Chains shares so they land in the order they were made.
  const publishRef = useRef<Promise<unknown>>(Promise.resolve());
  // Set once the host ends the picklist, so a late share can't switch it back on.
  const endedRef = useRef(false);

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

  // Everyone's picklists and the suggestions waiting, refetched whenever one changes.
  useEffect(() => {
    if (isSandbox) return;

    let cancelled = false;
    const loadPicklists = async () => {
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
    const loadSuggestions = async () => {
      const pending = await getPendingSuggestions(event.id);
      if (!cancelled) setSuggestions(pending);
    };
    void loadPicklists();
    void loadSuggestions();
    const channel = supabase
      .channel(`live-picklist-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "picklists", filter: `event_id=eq.${event.id}` },
        () => void loadPicklists()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_picklist_suggestions", filter: `event_id=eq.${event.id}` },
        () => void loadSuggestions()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [event.id, userId, isSandbox]);

  const peopleIds = useMemo(
    () =>
      [...new Set([...picklists.map((picklist) => picklist.userId), ...suggestions.map((s) => s.author_id)])]
        .sort()
        .join(","),
    [picklists, suggestions]
  );
  useEffect(() => {
    if (isSandbox || !peopleIds) return;
    let cancelled = false;
    getProfileNames(peopleIds.split(",")).then((map) => {
      if (!cancelled) setRemoteNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [peopleIds, isSandbox]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(event.id), JSON.stringify({ selectedIds, compiledIds, manual, tags, notes, dnpOverrides }));
    } catch {
      /* private window or full storage: the list just won't survive a reload */
    }
  }, [event.id, selectedIds, compiledIds, manual, tags, notes, dnpOverrides]);

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
  // Teams on anyone's Do Not Pick list, then the host's own calls, which win. DNP teams are
  // kept out of the main list and shown on their own with the DNP Teams toggle; each list
  // keeps its own order and places.
  const listedDnp = useMemo(() => new Set(picklists.flatMap((picklist) => picklist.doNotPick)), [picklists]);
  const dnpTeams = useMemo(() => {
    const teams = new Set(listedDnp);
    for (const [team, dnp] of Object.entries(dnpOverrides)) {
      if (dnp) teams.add(Number(team));
      else teams.delete(Number(team));
    }
    return teams;
  }, [listedDnp, dnpOverrides]);
  // Moves a team into or out of DNP Teams. Putting it back where everyone's lists have it
  // drops the host's call, so it follows their lists again.
  const setDnp = (teamNumber: number, dnp: boolean) =>
    setDnpOverrides((current) => {
      const next = { ...current };
      if (dnp === listedDnp.has(teamNumber)) delete next[teamNumber];
      else next[teamNumber] = dnp;
      return next;
    });
  // Tags ride along on the entries shown and shared, but stay out of `entries` itself so a
  // hand-arranged list never saves an old copy of them.
  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => dnpTeams.has(entry.teamNumber) === showDnp)
        .map((entry) => (tags[entry.teamNumber] ? { ...entry, tags: tags[entry.teamNumber] } : entry)),
    [entries, dnpTeams, showDnp, tags]
  );
  const groupOf = (teamNumber: number) =>
    entries.filter((entry) => dnpTeams.has(entry.teamNumber) === dnpTeams.has(teamNumber));
  // Someone changed a compiled picklist after the host started arranging by hand.
  const updatesWaiting = manual != null && compiledIds != null && manual.signature !== compiledSignature;
  const compiledCount = compiledIds?.length ?? 0;

  // Shares the list for everyone watching, shortly after it settles.
  useEffect(() => {
    if (isSandbox) return;
    const timer = window.setTimeout(() => {
      if (endedRef.current) return;
      const shared = entries.map((entry) => ({
        ...entry,
        dnp: dnpTeams.has(entry.teamNumber),
        ...(tags[entry.teamNumber] ? { tags: tags[entry.teamNumber] } : {}),
        ...(notes[entry.teamNumber] ? { note: notes[entry.teamNumber] } : {}),
      }));
      publishRef.current = publishRef.current.then(() =>
        publishLivePicklist(event.id, userId, shared, compiledCount)
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isSandbox, event.id, userId, entries, dnpTeams, tags, notes, compiledCount]);

  const suggestionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const suggestion of suggestions) {
      counts.set(suggestion.team_number, (counts.get(suggestion.team_number) ?? 0) + 1);
    }
    return counts;
  }, [suggestions]);

  const handleCompile = () => {
    setCompiledIds(selectedIds.filter((id) => choices.some((choice) => choice.userId === id)));
    setManual(null);
  };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));

  // Moves a team to where another one is. Both are in the same list (main or DNP), so the
  // teams in the other list keep their places.
  const reorder = (teamNumber: number, overTeamNumber: number) => {
    const from = entries.findIndex((entry) => entry.teamNumber === teamNumber);
    const to = entries.findIndex((entry) => entry.teamNumber === overTeamNumber);
    if (from < 0 || to < 0 || from === to) return;
    // Dragged out of any tie it was in, like teams tied on their average
    const next = arrayMove(entries, from, to).map((entry, index) =>
      index === to ? { ...entry, moved: true, tieGroup: undefined } : entry
    );
    setManual({ entries: next, signature: manual?.signature ?? compiledSignature });
  };

  // Ties a team with the one above or below it in its list (main or DNP), joining any tie
  // either is already in.
  const tieWith = (teamNumber: number, neighbor: LivePicklistEntry) => {
    const self = entries.find((entry) => entry.teamNumber === teamNumber);
    if (!self) return;
    const id = neighbor.tieGroup ?? self.tieGroup ?? Math.max(0, ...entries.map((entry) => entry.tieGroup ?? 0)) + 1;
    const merging = [self.tieGroup, neighbor.tieGroup].filter((group): group is number => group != null);
    const next = entries.map((entry) =>
      entry.teamNumber === teamNumber ||
      entry.teamNumber === neighbor.teamNumber ||
      (entry.tieGroup != null && merging.includes(entry.tieGroup))
        ? { ...entry, tieGroup: id }
        : entry
    );
    setManual({ entries: next, signature: manual?.signature ?? compiledSignature });
  };

  const untie = (teamNumber: number) =>
    setManual({
      entries: entries.map((entry) => (entry.teamNumber === teamNumber ? { ...entry, tieGroup: undefined } : entry)),
      signature: manual?.signature ?? compiledSignature,
    });

  const teamMenu = (teamNumber: number): LiveMenuItem[] => {
    const group = groupOf(teamNumber);
    const index = group.findIndex((entry) => entry.teamNumber === teamNumber);
    const self = group[index];
    const above = index > 0 ? group[index - 1] : undefined;
    const below = index >= 0 ? group[index + 1] : undefined;
    return [
      {
        label: above ? `Tie with team above (${above.teamNumber})` : "Tie with team above",
        disabled: !above || tiedWith(above, self),
        onSelect: () => above && tieWith(teamNumber, above),
      },
      {
        label: below ? `Tie with team below (${below.teamNumber})` : "Tie with team below",
        disabled: !below || tiedWith(self, below),
        onSelect: () => below && tieWith(teamNumber, below),
      },
      ...(self?.tieGroup != null ? [{ label: "Untie", onSelect: () => untie(teamNumber) }] : []),
    ];
  };

  const handleResolve = async (suggestion: LivePicklistSuggestion, accept: boolean) => {
    if (accept && isDnpMove(suggestion.direction)) {
      setDnp(suggestion.team_number, suggestion.direction === "to_dnp");
    } else if (accept) {
      // Spots count within the team's own list (main or DNP), the one the suggester saw it in
      const group = groupOf(suggestion.team_number);
      const from = group.findIndex((entry) => entry.teamNumber === suggestion.team_number);
      if (from >= 0) {
        // "Up" is toward first place. With no number given, move it one spot.
        const step = (suggestion.spots ?? 1) * (suggestion.direction === "up" ? -1 : 1);
        const to = Math.min(group.length - 1, Math.max(0, from + step));
        if (to !== from) reorder(suggestion.team_number, group[to].teamNumber);
      }
    }
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    if (!(await resolveSuggestion(suggestion.id, accept ? "accepted" : "dismissed"))) {
      toast({ title: "Could not update the suggestion", variant: "destructive" });
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    endedRef.current = true;
    await publishRef.current;
    onEnd();
  };

  return (
    <div>
      {/* On phones, two rows: Picklist and Suggestions on top, End and Picklists/Compile below. */}
      <div className="mb-2 grid grid-cols-[auto_1fr] items-center gap-2 sm:flex sm:flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={onExit} title="Back to your picklist. The live picklist keeps running.">
            <ArrowLeft className="h-4 w-4" />
            Picklist
          </Button>
          <LiveStatus />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="relative col-start-2 row-start-1 gap-1.5 justify-self-end sm:ml-auto"
              disabled={isSandbox}
            >
              <MessageCircle className="h-4 w-4" />
              Suggestions
              {suggestions.length > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {suggestions.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <p className="border-b px-3 py-2 text-sm font-semibold">Suggestions</p>
            {suggestions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No suggestions yet.
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {suggestions.map((suggestion) => {
                  const place = groupOf(suggestion.team_number).findIndex(
                    (entry) => entry.teamNumber === suggestion.team_number
                  );
                  return (
                    <li key={suggestion.id} className="flex items-center gap-2 px-3 py-2">
                      <SuggestionIcon direction={suggestion.direction} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="wrap-anywhere">
                          <span className="font-medium">{names.get(suggestion.author_id) ?? "Someone"}</span>:{" "}
                          {describeMove(suggestion)}
                        </p>
                        {place >= 0 && (
                          <p className="text-xs text-muted-foreground">
                            Now #{place + 1}
                            {dnpTeams.has(suggestion.team_number) && " in DNP Teams"}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-emerald-600"
                        aria-label="Apply suggestion"
                        title={suggestion.spots || isDnpMove(suggestion.direction) ? "Apply" : "Apply (moves it one spot)"}
                        onClick={() => void handleResolve(suggestion, true)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        aria-label="Dismiss suggestion"
                        title="Dismiss"
                        onClick={() => void handleResolve(suggestion, false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>
        <div className="col-start-2 row-start-2 flex items-center justify-end gap-2">
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
        <Button
          variant="destructive"
          className="col-start-1 row-start-2 gap-1.5 justify-self-start"
          disabled={ending}
          onClick={() => setConfirmEndOpen(true)}
        >
          {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
          End
        </Button>
      </div>

      {updatesWaiting && (
        <p className="mb-3 text-xs text-muted-foreground">
          Some picklists changed since you rearranged the list. Compile again to bring the changes in.
        </p>
      )}

      <div className="mb-3">
        <TagFilter tags={existingTags} selected={activeTagFilter} onChange={setTagFilter} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <DnpToggle checked={showDnp} onChange={setShowDnp} count={dnpTeams.size} />
        <StatFilterButton filter={statFilter} onChange={setStatFilter} loading={!teamStats} />
      </div>

      <LiveGrid
        entries={visibleEntries}
        teamsByNumber={teamsByNumber}
        editable
        suggestionCounts={suggestionCounts}
        onReorder={reorder}
        menuItems={teamMenu}
        tagFilter={activeTagFilter}
        statMatches={statMatches}
        onTeamClick={(team) => {
          setInfoTeam(team.team_number);
          setInfoOpen(true);
        }}
        emptyMessage={showDnp ? "No team is on anyone's Do Not Pick list." : "Every team is on someone's Do Not Pick list."}
      />

      <TeamInfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        teamNumber={infoTeam}
        event={event}
        userId={userId}
        userName={userName}
        devMode={devMode}
        // The host's own notes are under Everyone's Notes, apart from the live picklist's
        showMyNotes={false}
        renderHeaderAction={(teamNumber) => (
          <DnpButton
            dnp={dnpTeams.has(teamNumber)}
            listedCount={picklists.filter((picklist) => picklist.doNotPick.includes(teamNumber)).length}
            moved={teamNumber in dnpOverrides}
            onChange={(dnp) => setDnp(teamNumber, dnp)}
          />
        )}
        renderExtra={(teamNumber) => (
          <>
            <TeamTagEditor
              key={teamNumber}
              teamNumber={teamNumber}
              tags={tags[teamNumber] ?? []}
              existingTags={existingTags}
              onChange={(teamTags) =>
                setTags((current) => {
                  const next = { ...current };
                  if (teamTags.length > 0) next[teamNumber] = teamTags;
                  else delete next[teamNumber];
                  return next;
                })
              }
            />
            <LiveTeamNoteEditor
              key={`live-note:${teamNumber}`}
              note={notes[teamNumber] ?? ""}
              onChange={(note) =>
                setNotes((current) => {
                  const next = { ...current };
                  if (note) next[teamNumber] = note;
                  else delete next[teamNumber];
                  return next;
                })
              }
            />
            {/* The sandbox's event isn't in the database, so there are no notes to read */}
            {!isSandbox && (
              <TeamRankings
                key={`rankings:${teamNumber}`}
                eventId={event.id}
                teamNumber={teamNumber}
                picklists={picklists}
                currentUserId={userId}
              />
            )}
          </>
        )}
      />

      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>End the live picklist?</DialogTitle>
            <DialogDescription>
              Everyone watching will stop seeing the list and won't be able to send suggestions. Your
              arrangement stays on this device, so you can start the picklist again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEndOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={ending}
              onClick={() => {
                setConfirmEndOpen(false);
                void handleEnd();
              }}
            >
              End picklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface LivePicklistViewerProps {
  event: Event;
  /** Every team at the event. */
  teams: TBATeamSimple[];
  /** The host's shared list. */
  live: LivePicklistRow;
  userId?: string;
  onExit: () => void;
  onTeamClick: (team: TBATeamSimple) => void;
}

/** Everyone else's view of the live picklist: read only, with suggestions for the host. */
export function LivePicklistViewer({ event, teams, live, userId, onExit, onTeamClick }: LivePicklistViewerProps) {
  const { toast } = useToast();
  const [suggestTeam, setSuggestTeam] = useState<TBATeamSimple | null>(null);
  const [direction, setDirection] = useState<SuggestionDirection>("up");
  const [spots, setSpots] = useState("");
  const [sending, setSending] = useState(false);
  const [showDnp, setShowDnp] = useState(false);

  const teamsByNumber = useMemo(() => new Map(teams.map((team) => [team.team_number, team])), [teams]);
  const dnpCount = useMemo(() => live.entries.filter((entry) => entry.dnp).length, [live.entries]);
  const liveTags = useMemo(() => distinctTags(live.entries.map(entryTags)), [live.entries]);
  // The tag filter's choices, each dropped once the host takes that tag off every team
  const [tagFilter, setTagFilter] = useState<LivePicklistTag[]>([]);
  const activeTagFilter = tagFilter.filter((chosen) => liveTags.some((tag) => sameTag(tag, chosen)));
  const teamStats = useTeamStats(event, null);
  const [statFilter, setStatFilter] = useState<StatFilterValue | null>(null);
  const statMatches =
    statFilter && teamStats ? (teamNumber: number) => matchesStatFilter(teamStats.get(teamNumber), statFilter) : undefined;
  const visibleEntries = useMemo(
    () => live.entries.filter((entry) => !!entry.dnp === showDnp),
    [live.entries, showDnp]
  );
  const labels = useMemo(() => rankLabels(visibleEntries), [visibleEntries]);
  const suggestIndex = suggestTeam
    ? visibleEntries.findIndex((entry) => entry.teamNumber === suggestTeam.team_number)
    : -1;
  const suggestPlace = suggestIndex >= 0 ? labels[suggestIndex] : undefined;
  // DNP moves don't take a number of spots
  const dnpMove = isDnpMove(direction);
  const spotCount = spots === "" || dnpMove ? null : Number(spots);
  const spotsValid = spotCount === null || (Number.isInteger(spotCount) && spotCount > 0);
  const suggestTeamDnp =
    !!suggestTeam && !!live.entries.find((entry) => entry.teamNumber === suggestTeam.team_number)?.dnp;

  const openSuggest = (team: TBATeamSimple) => {
    setSuggestTeam(team);
    setDirection("up");
    setSpots("");
  };

  const handleSend = async () => {
    if (!suggestTeam || !spotsValid) return;
    setSending(true);
    const sent = await suggestMove(event.id, suggestTeam.team_number, direction, spotCount);
    setSending(false);
    if (sent) {
      void unlockAchievement(userId, "picklist_suggestion");
      toast({
        title: "Suggestion sent",
        description: `You suggested to ${describeMove({ team_number: suggestTeam.team_number, direction, spots: spotCount })}.`,
      });
      setSuggestTeam(null);
    } else {
      toast({ title: "Could not send your suggestion", variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="gap-1.5" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" />
          Picklist
        </Button>
        <LiveStatus />
      </div>
      <div className="mb-3">
        <TagFilter tags={liveTags} selected={activeTagFilter} onChange={setTagFilter} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <DnpToggle checked={showDnp} onChange={setShowDnp} count={dnpCount} />
        <StatFilterButton filter={statFilter} onChange={setStatFilter} loading={!teamStats} />
      </div>

      <LiveGrid
        entries={visibleEntries}
        teamsByNumber={teamsByNumber}
        editable={false}
        tagFilter={activeTagFilter}
        statMatches={statMatches}
        onTeamClick={onTeamClick}
        onSuggest={openSuggest}
        emptyMessage={showDnp ? "No team is on anyone's Do Not Pick list." : "Every team is on someone's Do Not Pick list."}
      />

      <Dialog open={suggestTeam != null} onOpenChange={(open) => !open && setSuggestTeam(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Suggest a move for {suggestTeam?.team_number}</DialogTitle>
            <DialogDescription>
              {suggestPlace
                ? `Currently ${suggestPlace.tied ? `tied for #${suggestPlace.label}` : `#${suggestPlace.label}`}. `
                : ""}
              The picklist host decides whether to make the move.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={direction === "up" ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setDirection("up")}
              >
                <ArrowUp className="h-4 w-4" />
                Move up
              </Button>
              <Button
                variant={direction === "down" ? "default" : "outline"}
                className="gap-1.5"
                onClick={() => setDirection("down")}
              >
                <ArrowDown className="h-4 w-4" />
                Move down
              </Button>
              <Button
                variant={dnpMove ? "default" : "outline"}
                className="col-span-2 gap-1.5"
                onClick={() => setDirection(suggestTeamDnp ? "from_dnp" : "to_dnp")}
              >
                {suggestTeamDnp ? <Undo2 className="h-4 w-4" /> : <DnpMark className="text-sm" />}
                {suggestTeamDnp ? "Move out of DNP Teams" : "Move to DNP Teams"}
              </Button>
            </div>
            {!dnpMove && (
              <div className="space-y-1.5">
                <Label htmlFor="suggest-spots">Spots (optional)</Label>
                <Input
                  id="suggest-spots"
                  type="text"
                  inputMode="numeric"
                  placeholder="Any amount"
                  value={spots}
                  onChange={(changeEvent) => {
                    if (/^\d*$/.test(changeEvent.target.value)) setSpots(changeEvent.target.value);
                  }}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter") void handleSend();
                  }}
                />
              </div>
            )}
            {suggestTeam && (
              <p className="text-sm text-muted-foreground">
                “{describeMove({ team_number: suggestTeam.team_number, direction, spots: spotCount })}”
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestTeam(null)}>
              Cancel
            </Button>
            <Button disabled={sending || !spotsValid} onClick={() => void handleSend()}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
