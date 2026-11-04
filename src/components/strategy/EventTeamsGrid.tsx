import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PicklistCardContent } from "@/components/strategy/PicklistCardContent";
import { getEventRankings, type TBATeamSimple } from "@/lib/blueAlliance";
import { isDevEventId } from "@/lib/devMode";
import { buildTeamDashboard, formatNumber, loadEventData, type EventTeamSort } from "@/lib/strategyData";
import type { Event } from "@/types";

/** What a sort can't show yet, by sort; teams then fall back to number order. */
const MISSING: Record<Exclude<EventTeamSort, "number">, string> = {
  rank: "TBA hasn't posted rankings for this event yet, so teams are in number order.",
  points: "No teams have been scouted at this event yet, so teams are in number order.",
};

/** What a team is sorted by, plus its average RP when sorted by TBA rank. */
interface SortValue {
  value: number;
  rpAverage?: number | null;
}

/**
 * Each team's TBA rank, or its average scouted total points, by team number.
 * Loaded only once that sort is picked; the dev sandbox has no TBA rankings.
 */
async function loadSortValues(
  sort: Exclude<EventTeamSort, "number">,
  event: Event,
  sandbox: { userId: string; userName: string | null } | null
): Promise<Map<number, SortValue>> {
  if (sort === "rank") {
    if (sandbox || !event.event_code) return new Map();
    const rankings = await getEventRankings(event.event_code);
    return new Map([...rankings].map(([teamNumber, { rank, rpAverage }]) => [teamNumber, { value: rank, rpAverage }]));
  }
  const data = await loadEventData(event, sandbox);
  const averages = new Map<number, SortValue>();
  for (const row of data.quant) {
    if (row.teamNumber == null || averages.has(row.teamNumber)) continue;
    const mean = buildTeamDashboard(row.teamNumber, data).totalPoints?.mean;
    if (mean != null) averages.set(row.teamNumber, { value: mean });
  }
  return averages;
}

/** Every team at the event as cards, in the chosen order. */
export function EventTeamsGrid({ teams, event, sort, userId, userName, devMode, onSelectTeam }: {
  teams: TBATeamSimple[];
  event: Event;
  sort: EventTeamSort;
  userId?: string;
  userName: string | null;
  devMode: boolean;
  onSelectTeam: (team: TBATeamSimple) => void;
}) {
  const key = `${event.id}:${sort}`;
  const [loaded, setLoaded] = useState<{ key: string; values: Map<number, SortValue> } | null>(null);

  useEffect(() => {
    if (sort === "number") return;
    let mounted = true;
    const sandbox = devMode && userId && isDevEventId(event.id) ? { userId, userName } : null;
    loadSortValues(sort, event, sandbox)
      .catch((cause) => {
        console.error(`Could not load ${sort} for the event's teams:`, cause);
        return new Map<number, SortValue>();
      })
      .then((values) => { if (mounted) setLoaded({ key: `${event.id}:${sort}`, values }); });
    return () => { mounted = false; };
  }, [event, sort, userId, userName, devMode]);

  const values = sort !== "number" && loaded?.key === key ? loaded.values : null;
  const sorted = useMemo(() => {
    if (!values) return teams;
    // Ranks go lowest first, point averages highest first; teams without one go last.
    const direction = sort === "rank" ? 1 : -1;
    return [...teams].sort((a, b) => {
      const aValue = values.get(a.team_number)?.value;
      const bValue = values.get(b.team_number)?.value;
      if (aValue == null || bValue == null) {
        return aValue == null && bValue == null ? a.team_number - b.team_number : aValue == null ? 1 : -1;
      }
      return (aValue - bValue) * direction || a.team_number - b.team_number;
    });
  }, [teams, values, sort]);

  const detail = (teamNumber: number) => {
    const entry = values?.get(teamNumber);
    if (!entry) return null;
    return (
      <span className="flex shrink-0 flex-col items-end font-mono text-xs font-semibold tabular-nums text-muted-foreground">
        {sort === "rank" ? `#${entry.value}` : `${formatNumber(entry.value)} pts`}
        {entry.rpAverage != null && <span className="text-[10px] font-medium">{entry.rpAverage.toFixed(2)} RP</span>}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {sort !== "number" && !values ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {sort === "rank" ? "Loading rankings..." : "Loading scouting averages..."}
        </p>
      ) : sort !== "number" && values?.size === 0 ? (
        <p className="text-xs text-muted-foreground">{MISSING[sort]}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {sorted.map((team) => (
          <Card
            key={team.team_number}
            onClick={() => onSelectTeam(team)}
            className="cursor-pointer gap-0 py-0 hover:bg-accent/50"
          >
            <PicklistCardContent team={team} detail={detail(team.team_number)} />
          </Card>
        ))}
      </div>
    </div>
  );
}
