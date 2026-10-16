import { useEffect, useMemo, useState } from "react";
import { Medal } from "lucide-react";
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

  const selected = events.find((event) => event.eventId === selectedId) ?? null;
  const ranked = useMemo(() => {
    if (!selected) return [];
    const key: keyof LeaderboardRow = category === "submissions" ? "submission_count" : "points";
    return [...selected.rows].sort(
      (a, b) => (b[key] as number) - (a[key] as number) || a.scouter_name.localeCompare(b.scouter_name)
    );
  }, [selected, category]);

  if (loading) return <p className="text-center text-muted-foreground py-12">Loading leaderboards...</p>;
  if (events.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No leaderboards yet. Standings appear once scouts submit data.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-20">
      <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
        <SelectTrigger><SelectValue placeholder="Select an event" /></SelectTrigger>
        <SelectContent>
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
        <CardContent className="divide-y p-0">
          {ranked.map((row, index) => (
            <div
              key={row.scouter_id}
              className={`flex items-center gap-3 px-4 py-3 ${row.scouter_id === user?.id ? "bg-primary/10" : ""}`}
            >
              <span className={`flex w-8 items-center gap-1 font-bold tabular-nums ${rankStyle(index + 1)}`}>
                {index < 3 ? <Medal className="h-4 w-4" /> : null}{index + 1}
              </span>
              <span className="flex-1 truncate font-medium">{row.scouter_name}</span>
              <span className="font-mono font-semibold tabular-nums">
                {(category === "submissions" ? row.submission_count : row.points).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
      {selected && (
        <p className="text-center text-xs text-muted-foreground">
          Points are each scout's balance as of {new Date(selected.rows[0].snapshot_at).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
