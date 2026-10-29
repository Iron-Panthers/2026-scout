import { useEffect, useState } from "react";
import { buildTeamDashboard, loadEventData, type TeamDashboard } from "@/lib/strategyData";
import type { Event } from "@/types";

/** The first number in a pit scout's typed answer ("125 lb" → 125), or null if there isn't one. */
function numberIn(text: string): number | null {
  const match = text.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** What the live picklist can be filtered on, and each team's value (null when there's no data). */
export const STAT_FILTERS = [
  { key: "autoFuel", label: "Average auto fuel", value: (team: TeamDashboard) => team.autoFuel?.mean ?? null },
  { key: "teleopFuel", label: "Average teleop fuel", value: (team: TeamDashboard) => team.teleopFuel?.mean ?? null },
  { key: "totalPoints", label: "Average total points", value: (team: TeamDashboard) => team.totalPoints?.mean ?? null },
  { key: "climb", label: "Average climb", value: (team: TeamDashboard) => team.averageClimb },
  {
    key: "errorRate",
    label: "Error rate (%)",
    value: (team: TeamDashboard) => (team.errorRate ? (team.errorRate.problems / team.errorRate.submissions) * 100 : null),
  },
  // A team nobody has ranked only has the starting rating, which says nothing about it
  { key: "dcElo", label: "DC ELO", value: (team: TeamDashboard) => (team.defenseElo.rankings > 0 ? team.defenseElo.rating : null) },
  { key: "weight", label: "Weight", value: (team: TeamDashboard) => numberIn(team.weight) },
  // Modular robots by their raised capacity
  {
    key: "hopperCapacity",
    label: "Hopper Capacity",
    value: (team: TeamDashboard) => numberIn(team.hopperCapacityRaised || team.hopperCapacity),
  },
  { key: "shootingSpeed", label: "Shooting Speed", value: (team: TeamDashboard) => numberIn(team.shootingSpeed) },
] as const;

export type StatFilterKey = (typeof STAT_FILTERS)[number]["key"];

export const COMPARISONS = [
  { key: "lt", label: "Less than", symbol: "<" },
  { key: "gt", label: "Greater than", symbol: ">" },
  { key: "eq", label: "Equal to", symbol: "=" },
] as const;

export type Comparison = (typeof COMPARISONS)[number]["key"];

export interface StatFilterValue {
  stat: StatFilterKey;
  comparison: Comparison;
  target: number;
  /** Decimal places typed, so "equal to 20" matches anything that rounds to 20. */
  decimals: number;
}

/** Whether a team fits the filter. Teams without data for the stat don't. */
export function matchesStatFilter(team: TeamDashboard | undefined, filter: StatFilterValue): boolean {
  const stat = STAT_FILTERS.find((item) => item.key === filter.stat);
  const value = team && stat ? stat.value(team) : null;
  if (value == null) return false;
  if (filter.comparison === "lt") return value < filter.target;
  if (filter.comparison === "gt") return value > filter.target;
  return Number(value.toFixed(filter.decimals)) === filter.target;
}

export const describeStatFilter = (filter: StatFilterValue) =>
  `${STAT_FILTERS.find((item) => item.key === filter.stat)?.label} ${
    COMPARISONS.find((item) => item.key === filter.comparison)?.symbol
  } ${filter.target}`;

/**
 * Every team's stats for the filter, from the event's scouting data; null while it loads.
 * `sandbox` reads the dev-mode local store instead.
 */
export function useTeamStats(
  event: Event,
  sandbox: { userId: string; userName: string | null } | null
): Map<number, TeamDashboard> | null {
  const [stats, setStats] = useState<{ eventId: string; teams: Map<number, TeamDashboard> } | null>(null);
  const sandboxUserId = sandbox?.userId;
  const sandboxUserName = sandbox?.userName ?? null;

  useEffect(() => {
    let mounted = true;
    loadEventData(event, sandboxUserId ? { userId: sandboxUserId, userName: sandboxUserName } : null)
      .then((data) => {
        if (!mounted) return;
        const teams = new Map<number, TeamDashboard>();
        for (const teamNumber of data.schedule.teamNames.keys()) teams.set(teamNumber, buildTeamDashboard(teamNumber, data));
        for (const row of data.quant) {
          if (row.teamNumber != null && !teams.has(row.teamNumber)) teams.set(row.teamNumber, buildTeamDashboard(row.teamNumber, data));
        }
        setStats({ eventId: event.id, teams });
      })
      .catch((cause) => console.error("Could not load team stats for the filter:", cause));
    return () => {
      mounted = false;
    };
  }, [event, sandboxUserId, sandboxUserName]);

  return stats?.eventId === event.id ? stats.teams : null;
}
