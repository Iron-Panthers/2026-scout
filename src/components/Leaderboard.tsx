import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { getEvents } from "@/lib/matches";
import {
  getLeaderboardEvents,
  refreshEventLeaderboard,
  type LeaderboardEvent,
  type LeaderboardRow,
} from "@/lib/leaderboards";

type Category = "submissions" | "points";

/** One line of the leaderboard, whichever category it ranks by. */
interface RankedRow {
  scouterId: string;
  name: string;
  value: string;
}

/** The dropdown's "All events" choice. */
const ALL_EVENTS = "all";

/**
 * Every scouter's whole career: submissions added up across events. Points are a scout's
 * balance at the time each event was counted, not what they earned there, so adding them
 * would count the same coins again; their latest balance is used instead.
 */
function careerRows(events: LeaderboardEvent[]): LeaderboardRow[] {
  const byScouter = new Map<string, LeaderboardRow>();
  for (const event of events) {
    for (const row of event.rows) {
      const total = byScouter.get(row.scouter_id);
      if (!total) {
        byScouter.set(row.scouter_id, { ...row });
        continue;
      }
      total.submission_count += row.submission_count;
      if (Date.parse(row.snapshot_at) > Date.parse(total.snapshot_at)) {
        total.points = row.points;
        total.scouter_name = row.scouter_name;
        total.snapshot_at = row.snapshot_at;
      }
    }
  }
  return [...byScouter.values()];
}

/** Ranks per column; wider screens show three columns to a page, phones one. */
const COLUMN_SIZE = 10;
const WIDE_QUERY = "(min-width: 640px)"; // Tailwind's sm

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE_QUERY).matches;

function rankStyle(rank: number) {
  if (rank === 1) return "text-yellow-500";
  if (rank === 2) return "text-slate-400";
  if (rank === 3) return "text-amber-700";
  return "text-muted-foreground";
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<LeaderboardEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("submissions");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Re-count events that still exist; deleted ones keep their saved final standings.
      const liveEvents = await getEvents();
      await Promise.all(liveEvents.map((event) => refreshEventLeaderboard(event.id)));
      const saved = await getLeaderboardEvents();
      if (cancelled) return;
      setEvents(saved);
      const active = liveEvents.find((event) => event.is_active);
      setSelectedId((active && saved.some((e) => e.eventId === active.id) ? active.id : saved[0]?.eventId) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const isAll = selectedId === ALL_EVENTS;
  const selected = events.find((event) => event.eventId === selectedId) ?? null;
  const rows = useMemo(() => (isAll ? careerRows(events) : selected?.rows ?? []), [isAll, events, selected]);
  const ranked = useMemo((): RankedRow[] => {
    const key: keyof LeaderboardRow = category === "submissions" ? "submission_count" : "points";
    return [...rows]
      .sort((a, b) => (b[key] as number) - (a[key] as number) || a.scouter_name.localeCompare(b.scouter_name))
      .map((row) => ({ scouterId: row.scouter_id, name: row.scouter_name, value: (row[key] as number).toLocaleString() }));
  }, [rows, category]);

  // Pages of 30 (three columns of 10) on wider screens, 10 on phones. Each new list (event,
  // category or screen size) opens on the page with the user's own row.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const pageSize = wide ? COLUMN_SIZE * 3 : COLUMN_SIZE;
  const pageCount = Math.max(1, Math.ceil(ranked.length / pageSize));
  const listKey = `${selectedId}|${category}|${pageSize}|${ranked.length}`;
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  if (pageState.key !== listKey) {
    const ownIndex = ranked.findIndex((row) => row.scouterId === user?.id);
    setPageState({ key: listKey, page: ownIndex >= 0 ? Math.floor(ownIndex / pageSize) : 0 });
  }
  const page = Math.min(pageState.page, pageCount - 1);
  const goToPage = (next: number) => setPageState({ key: listKey, page: Math.max(0, Math.min(pageCount - 1, next)) });
  const pageStart = page * pageSize;
  const pageRows = ranked.slice(pageStart, pageStart + pageSize);

  if (loading) return <p className="text-center text-muted-foreground py-12">Loading leaderboards...</p>;
  if (events.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No leaderboards yet. Standings appear once scouts submit data.</p>;
  }

  return (
    <div className="mx-auto max-w space-y-4 pb-20">
      <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
        <SelectTrigger className="w-full" aria-label="Event the standings are counted from">
          <SelectValue placeholder="Select an event" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_EVENTS}>All events</SelectItem>
          {events.map((event) => (
            <SelectItem key={event.eventId} value={event.eventId}>
              {event.eventName}{event.eventCode ? ` (${event.eventCode})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tabs value={category} onValueChange={(value) => setCategory(value as Category)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submissions">Most Submissions</TabsTrigger>
          <TabsTrigger value="points">Most Points</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        {/* This page's ranks in columns of 10, side by side (one column on phones) */}
        <CardContent className="grid w-full grid-cols-1 sm:grid-flow-col sm:auto-cols-fr">
          {Array.from({ length: Math.ceil(pageRows.length / COLUMN_SIZE) }, (_, column) => (
            <div key={column} className="min-w-0 sm:border-l-1">
              {pageRows.slice(column * COLUMN_SIZE, (column + 1) * COLUMN_SIZE).map((row, offset) => {
                const index = pageStart + column * COLUMN_SIZE + offset;
                return (
                  <div
                    key={row.scouterId}
                    className={`flex items-center gap-3 px-4 py-3 ${row.scouterId === user?.id ? "bg-primary/10" : ""}`}
                  >
                    <span className={`flex w-8 items-center gap-1 font-bold tabular-nums ${rankStyle(index + 1)}`}>
                      {index < 3 ? <Medal className="h-4 w-4" /> : null}{index + 1}
                    </span>
                    <span className="flex-1 truncate font-medium">{row.name}</span>
                    <span className="font-mono font-semibold tabular-nums">{row.value}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {!isAll && selected && selected.rows.length > 0
            ? `Points are each scout's balance as of ${new Date(selected.rows[0].snapshot_at).toLocaleDateString()}.`
            : null}
        </p>
        {pageCount > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {pageStart + 1}–{pageStart + pageRows.length} of {ranked.length}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page"
              disabled={page === 0} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next page"
              disabled={page >= pageCount - 1} onClick={() => goToPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
