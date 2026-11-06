import { isOutlier, usualRange, type UsualRange } from "@/lib/outliers";
import type { QuantRow } from "@/lib/strategyData";

/** The stats checked against a team's usual range, the same ones the data table flags. */
const STATS = [
  { label: "Auto fuel", value: (row: QuantRow) => row.autoShots },
  { label: "Teleop fuel", value: (row: QuantRow) => row.teleopShots },
  { label: "Total points", value: (row: QuantRow) => row.totalPoints },
] as const;

export interface StatRange extends UsualRange {
  label: string;
  /** What this submission scouted. */
  value: number;
  suspicious: boolean;
}

/** A submission with a stat outside its team's usual range at the event. */
export interface SuspiciousSubmission {
  teamNumber: number;
  /** How many of the team's submissions the ranges come from, this one included. */
  sample: number;
  /** Every checked stat, suspicious or not, so the popup can show the whole picture. */
  stats: StatRange[];
}

const submissionKey = (row: QuantRow) => `${row.matchId}:${row.role}:${row.scouterId}`;

/** A stat as the data table shows a range end: one decimal at most, never below zero. */
export const formatStat = (value: number) => String(Number(Math.max(0, value).toFixed(1)));

/**
 * The event's suspicious submissions by "matchId:role:scouterId": any whose auto fuel,
 * teleop fuel or total points falls outside its team's usual range (see outliers.ts).
 */
export function findSuspiciousSubmissions(rows: QuantRow[]): Map<string, SuspiciousSubmission> {
  const byTeam = new Map<number, QuantRow[]>();
  for (const row of rows) {
    if (row.teamNumber === null) continue;
    byTeam.set(row.teamNumber, [...(byTeam.get(row.teamNumber) ?? []), row]);
  }

  const result = new Map<string, SuspiciousSubmission>();
  for (const [teamNumber, teamRows] of byTeam) {
    const ranges = STATS.map((stat) => usualRange(teamRows.map(stat.value)));
    teamRows.forEach((row) => {
      if (!row.matchId || !row.scouterId) return;
      const stats = STATS.flatMap((stat, i) => {
        const range = ranges[i];
        if (!range) return [];
        const value = stat.value(row);
        return [{
          ...range,
          label: stat.label,
          value,
          suspicious: isOutlier(value, [range.low, range.high]),
        }];
      });
      if (stats.some((stat) => stat.suspicious)) {
        result.set(submissionKey(row), { teamNumber, sample: teamRows.length, stats });
      }
    });
  }
  return result;
}

/** "45 is 25 above team 254's usual 5–20", for one suspicious stat. */
export function describeStat(stat: StatRange, teamNumber: number): string {
  const range = `${formatStat(stat.low)}–${formatStat(stat.high)}`;
  if (stat.value > stat.high) return `${formatStat(stat.value)} is ${formatStat(stat.value - stat.high)} above team ${teamNumber}'s usual ${range}`;
  if (stat.value < stat.low) return `${formatStat(stat.value)} is ${formatStat(stat.low - stat.value)} below team ${teamNumber}'s usual ${range}`;
  return `${formatStat(stat.value)} is within team ${teamNumber}'s usual ${range}`;
}

/** Starts a rescout reason that came from suspicious data rather than a scout's report. */
export const SUSPICIOUS_REASON_PREFIX = "Suspicious: ";

/** The rescout reason for a suspicious submission, e.g. "Suspicious: Teleop fuel 45 is 25 above…". */
export function suspiciousReason(submission: SuspiciousSubmission): string {
  return SUSPICIOUS_REASON_PREFIX + submission.stats
    .filter((stat) => stat.suspicious)
    .map((stat) => `${stat.label} ${describeStat(stat, submission.teamNumber)}.`)
    .join(" ");
}
