import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ImageOff, Loader2, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamLogo } from "@/components/TeamLogo";
import { MatchVideoDialog } from "@/components/MatchVideoDialog";
import { isDevEventId } from "@/lib/devMode";
import {
  ORDINALS,
  RECENT_MATCH_COUNT,
  buildTeamDashboard,
  cachedEventLoad,
  defenseEloDetail,
  formatElo,
  formatNumber,
  loadEventData,
  type EventData,
  type MeanAndSpread,
  type PitRow,
  type EventSchedule,
  type ScheduledMatch,
  type TeamDashboard,
  type TeamNote,
} from "@/lib/strategyData";
import { Stat, type StatTone } from "@/components/strategy/MatchDashboard";
import { FuelDistributionChart } from "@/components/strategy/FuelDistributionChart";
import { FuelByMatchChart } from "@/components/strategy/FuelByMatchChart";
import type { Event } from "@/types";

type TeamSort = "number" | "points";

// Pit scouting answers shown in the summary, in form order (src/config/pitScoutingConfig.ts).
const PIT_FIELDS: Array<{ key: keyof PitRow; label: string }> = [
  { key: "dimensions", label: "Dimensions" },
  { key: "weight", label: "Weight" },
  { key: "drivetrain", label: "Drivetrain" },
  { key: "hopperCapacity", label: "Hopper capacity" },
  { key: "shootingSpeed", label: "Shooting / intake speed" },
  { key: "shootingMechanism", label: "Shooter type" },
  { key: "climb", label: "Climb" },
  { key: "terrain", label: "Height" },
  { key: "driverExperience", label: "Driver experience" },
];

const spreadDetail = (stats: MeanAndSpread | null) =>
  stats?.sd != null ? `SD ${formatNumber(stats.sd)}` : stats ? "SD needs 2+ matches" : undefined;

const matchLabel = (matchNumber: number | null) => (matchNumber != null ? `Q${matchNumber}` : "Unnumbered match");

/** "Level2" → "L2", "None" → "None", missing → "—". */
const climbLabel = (value: string | null) => value?.replace(/^level\s*/i, "L") || "—";

function SectionTitle({ children, compareKey }: { children: React.ReactNode; compareKey?: CompareKey }) {
  return (
    <h3 className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
      {compareKey && <TeamKey {...compareKey} />}
    </h3>
  );
}

function NoteSection({ title, notes }: { title: string; notes: TeamNote[] }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
        {title}
        <span className="rounded bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{notes.length}</span>
      </h4>
      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              <div className="text-[10px] text-muted-foreground">
                {[
                  note.matchNumber != null && `Q${note.matchNumber}`,
                  note.scouterName,
                  note.rank != null && `ranked ${ORDINALS[note.rank - 1] ?? note.rank}`,
                ].filter(Boolean).join(" · ")}
              </div>
              <p className="whitespace-pre-wrap break-words">{note.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamListItem({ team, selected, onSelect, compareColor }: {
  team: TeamDashboard;
  selected: boolean;
  onSelect: () => void;
  /** Compare mode only: the team's slot color when picked, else null for an empty marker. */
  compareColor?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors ${
        selected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent/50"
      }`}
    >
      {compareColor !== undefined && (
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${compareColor ? "" : "border border-muted-foreground/50"}`}
          style={compareColor ? { background: compareColor } : undefined}
        />
      )}
      <TeamLogo teamNumber={team.teamNumber} className="h-7 w-7 shrink-0 rounded border bg-muted object-contain" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-mono text-sm font-bold tabular-nums" style={compareColor ? { color: compareColor } : undefined}>{team.teamNumber}</p>
        <p className="truncate text-[11px] text-muted-foreground">{team.name ?? "Unknown team"}</p>
      </div>
      <div className="shrink-0 text-right leading-tight">
        <p className="text-sm font-semibold tabular-nums">{team.totalPoints ? formatNumber(team.totalPoints.mean) : "—"}</p>
        <p className="text-[10px] text-muted-foreground">
          {team.matchesScouted} match{team.matchesScouted === 1 ? "" : "es"}
        </p>
      </div>
    </button>
  );
}

type MatchResult = "win" | "loss" | "tie";

const RESULT_BADGE: Record<MatchResult, { label: string; className: string }> = {
  win: { label: "W", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  loss: { label: "L", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  tie: { label: "T", className: "bg-muted text-muted-foreground" },
};

/** How a played match went for `alliance`; null until it's been played. */
function matchResult(match: ScheduledMatch, alliance: "red" | "blue"): MatchResult | null {
  if (!match.winner) return null;
  if (match.winner === "tie") return "tie";
  return match.winner === alliance ? "win" : "loss";
}

function AllianceStrip({ color, teams, score, won, teamNumber, otherTeam, onSelectTeam }: {
  color: "red" | "blue";
  teams: number[];
  score: number | null;
  won: boolean;
  teamNumber: number;
  /** Compare mode: the other compared team, underlined in this alliance's color when it plays here. */
  otherTeam?: number;
  onSelectTeam: (teamNumber: number) => void;
}) {
  const tint = color === "red"
    ? won ? "bg-red-500/25" : "bg-red-500/10"
    : won ? "bg-blue-500/25" : "bg-blue-500/10";
  const text = color === "red" ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300";
  const otherUnderline = `underline underline-offset-2 ${color === "red" ? "decoration-red-500" : "decoration-blue-500"}`;
  return (
    <div className={`flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1 ${tint}`}>
      <div className="flex min-w-0 flex-wrap gap-x-2 font-mono text-xs tabular-nums">
        {teams.map((team) => team === teamNumber ? (
          <span key={team} className="font-black text-foreground underline underline-offset-2">{team}</span>
        ) : (
          <button
            key={team}
            type="button"
            onClick={() => onSelectTeam(team)}
            title={`Show team ${team}`}
            className={`${text} ${team === otherTeam ? otherUnderline : "hover:underline"}`}
          >
            {team}
          </button>
        ))}
      </div>
      <span className={`shrink-0 font-mono text-sm tabular-nums ${won ? "font-black" : "font-medium text-muted-foreground"}`}>
        {score ?? "–"}
      </span>
    </div>
  );
}

/** Compare mode's tint for a match the other compared team also plays in. */
const SHARED_MATCH = {
  with: { className: "bg-green-500/10 ring-1 ring-green-500/30", title: (team: number) => `With ${team}` },
  against: { className: "bg-red-500/10 ring-1 ring-red-500/30", title: (team: number) => `Against ${team}` },
};

/** Whether `otherTeam` is on `teamNumber`'s alliance, the opposing one, or not in the match. */
function sharedMatch(match: ScheduledMatch, teamNumber: number, otherTeam: number | undefined): keyof typeof SHARED_MATCH | null {
  if (otherTeam === undefined) return null;
  const alliance = match.red.includes(teamNumber) ? match.red : match.blue;
  const opponents = alliance === match.red ? match.blue : match.red;
  return alliance.includes(otherTeam) ? "with" : opponents.includes(otherTeam) ? "against" : null;
}

function MatchRow({ label, match, teamNumber, otherTeam, faded, onSelectTeam, onWatch }: {
  label: string;
  match: ScheduledMatch;
  teamNumber: number;
  otherTeam?: number;
  /** Outside the team's last few matches, when the page is limited to them. */
  faded?: boolean;
  onSelectTeam: (teamNumber: number) => void;
  /** Opens the match's video; absent when no match in the list has one (so no column is kept for it). */
  onWatch?: () => void;
}) {
  const result = matchResult(match, match.red.includes(teamNumber) ? "red" : "blue");
  const shared = sharedMatch(match, teamNumber, otherTeam);
  return (
    // When comparing, every row gets the same padding so tinted and plain rows line up.
    <li
      className={`flex items-center gap-2 transition-opacity ${otherTeam !== undefined ? "-mx-1 rounded-md px-1 py-0.5" : ""} ${shared ? SHARED_MATCH[shared].className : ""} ${faded ? "opacity-35" : ""}`}
      title={shared ? SHARED_MATCH[shared].title(otherTeam!) : undefined}
    >
      <div className="flex w-16 shrink-0 items-center gap-1.5">
        <span className="font-mono text-xs font-semibold tabular-nums">{label}</span>
        {result ? (
          <span className={`rounded px-1 text-[10px] font-bold ${RESULT_BADGE[result].className}`}>{RESULT_BADGE[result].label}</span>
        ) : match.status === "current" ? (
          <span className="text-[10px] font-medium text-yellow-600 dark:text-yellow-400">Now</span>
        ) : null}
      </div>
      {/* Alliances sit side by side when the card is wide enough, else stack. */}
      <div className="grid min-w-0 flex-1 gap-1 @md:grid-cols-2">
        <AllianceStrip color="red" teams={match.red} score={match.redScore} won={match.winner === "red"} teamNumber={teamNumber} otherTeam={otherTeam} onSelectTeam={onSelectTeam} />
        <AllianceStrip color="blue" teams={match.blue} score={match.blueScore} won={match.winner === "blue"} teamNumber={teamNumber} otherTeam={otherTeam} onSelectTeam={onSelectTeam} />
      </div>
      {onWatch && (match.videos.length > 0 ? (
        <button
          type="button"
          onClick={onWatch}
          title={`Watch ${label}`}
          aria-label={`Watch ${label}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      ) : (
        // Keeps rows without a video lined up with those that have one
        <span className="w-6 shrink-0" />
      ))}
    </li>
  );
}

function MatchGroup({ title, matches, teamNumber, otherTeam, onSelectTeam, onWatch }: {
  title: string;
  matches: Array<{ key: string; label: string; match: ScheduledMatch; faded: boolean }>;
  teamNumber: number;
  otherTeam?: number;
  onSelectTeam: (teamNumber: number) => void;
  onWatch?: (label: string, match: ScheduledMatch) => void;
}) {
  const results = matches
    .map(({ match }) => matchResult(match, match.red.includes(teamNumber) ? "red" : "blue"))
    .filter((result): result is MatchResult => result !== null);
  const count = (result: MatchResult) => results.filter((item) => item === result).length;

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold">{title}</h4>
        {results.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Record <span className="font-semibold tabular-nums text-foreground">{count("win")}-{count("loss")}-{count("tie")}</span>
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {matches.map(({ key, label, match, faded }) => (
          <MatchRow
            key={key}
            label={label}
            match={match}
            teamNumber={teamNumber}
            otherTeam={otherTeam}
            faded={faded}
            onSelectTeam={onSelectTeam}
            onWatch={onWatch && (() => onWatch(label, match))}
          />
        ))}
      </ul>
    </section>
  );
}

/** The team's qualification, playoff and finals matches with both alliances and, once played, the score and result. */
function MatchList({ teamNumber, schedule, recentMatches, onSelectTeam, compareKey, otherTeam }: {
  teamNumber: number;
  schedule: EventSchedule;
  /** The team's last few qualification matches when the page is limited to them; every other match fades. */
  recentMatches: number[] | null;
  onSelectTeam: (teamNumber: number) => void;
  compareKey?: CompareKey;
  /** Compare mode: the other team, whose shared matches are tinted green (allies) or red (opponents). */
  otherTeam?: number;
}) {
  const plays = (match: ScheduledMatch) => match.red.includes(teamNumber) || match.blue.includes(teamNumber);
  const quals = schedule.matches.filter(plays).map((match) => ({
    key: `qm${match.matchNumber}`,
    label: `Q${match.matchNumber}`,
    match,
    faded: !!recentMatches && !recentMatches.includes(match.matchNumber),
  }));
  // Scouting only covers qualifications, so the window never reaches playoffs.
  const playoffs = schedule.playoffs.filter(plays)
    .map((match) => ({ key: match.key, label: match.label, match, faded: !!recentMatches }));
  const bracket = playoffs.filter(({ match }) => !match.isFinal);
  const finals = playoffs.filter(({ match }) => match.isFinal);
  const [watching, setWatching] = useState<{ label: string; match: ScheduledMatch } | null>(null);
  const onWatch = [...quals, ...playoffs].some(({ match }) => match.videos.length > 0)
    ? (label: string, match: ScheduledMatch) => setWatching({ label, match })
    : undefined;
  const groupProps = { teamNumber, otherTeam, onSelectTeam, onWatch };

  return (
    <Card className="@container gap-0 p-4 sm:p-5">
      <SectionTitle compareKey={compareKey}>Matches</SectionTitle>
      {quals.length === 0 && playoffs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not in the published schedule.</p>
      ) : (
        <div className="space-y-4">
          {quals.length > 0 && <MatchGroup title="Qualifications" matches={quals} {...groupProps} />}
          {bracket.length > 0 && <MatchGroup title="Playoffs" matches={bracket} {...groupProps} />}
          {finals.length > 0 && <MatchGroup title="Finals" matches={finals} {...groupProps} />}
        </div>
      )}
      <MatchVideoDialog
        open={watching !== null}
        onOpenChange={(open) => { if (!open) setWatching(null); }}
        title={watching ? watching.label.replace(/^Q(\d+)$/, "Quals $1") : ""}
        videos={watching?.match.videos ?? []}
      />
    </Card>
  );
}

/** Identifies which compared team a card belongs to; its color matches that team's curves. */
type CompareKey = { teamNumber: number; color: string };

/** Compared teams' colors, by slot (src/index.css). */
const COMPARE_COLORS = ["var(--compare-a)", "var(--compare-b)"] as const;

function TeamKey({ teamNumber, color }: CompareKey) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs font-semibold normal-case tracking-normal" style={{ color }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {teamNumber}
    </span>
  );
}

/**
 * A team's quantitative rows, limited to its recent matches like the dashboard
 * is, and its pit rows (newest pit submission first, matching buildTeamDashboard).
 */
function teamRows(data: EventData, team: TeamDashboard) {
  const { teamNumber, recentMatches } = team;
  return {
    quant: data.quant.filter((row) => row.teamNumber === teamNumber
      && (!recentMatches || (row.matchNumber != null && recentMatches.includes(row.matchNumber)))),
    pit: data.pit
      .filter((row) => row.teamNumber === teamNumber)
      .sort((a, b) => b.scoutedAt.localeCompare(a.scoutedAt)),
  };
}

/**
 * Header stats compared side by side, as shown (rounded) so values that look equal
 * never get colored; null when the team has no data for that stat.
 */
const COMPARED_STATS = {
  autoFuel: { value: (team: TeamDashboard) => team.autoFuel && Number(formatNumber(team.autoFuel.mean)) },
  teleopFuel: { value: (team: TeamDashboard) => team.teleopFuel && Number(formatNumber(team.teleopFuel.mean)) },
  totalPoints: { value: (team: TeamDashboard) => team.totalPoints && Number(formatNumber(team.totalPoints.mean)) },
  climb: { value: (team: TeamDashboard) => team.averageClimb != null ? Number(formatNumber(team.averageClimb)) : null },
  errorRate: {
    value: (team: TeamDashboard) => team.errorRate && Math.round((team.errorRate.problems / team.errorRate.submissions) * 100),
    lowerIsBetter: true,
  },
  // Unranked teams sit at the starting rating, which says nothing about them.
  defenseElo: { value: (team: TeamDashboard) => team.defenseElo.rankings > 0 ? Math.round(team.defenseElo.rating) : null },
} satisfies Record<string, { value: (team: TeamDashboard) => number | null; lowerIsBetter?: boolean }>;

/** Green for the better of two teams' values, red for the worse, yellow for a tie; nothing when either is missing. */
function compareTone(stat: keyof typeof COMPARED_STATS, team: TeamDashboard, other: TeamDashboard | undefined): StatTone | null {
  if (!other) return null;
  const { value, lowerIsBetter = false }: { value: (team: TeamDashboard) => number | null; lowerIsBetter?: boolean } = COMPARED_STATS[stat];
  const [mine, theirs] = [value(team), value(other)];
  if (mine == null || theirs == null) return null;
  if (mine === theirs) return "tied";
  return (mine > theirs) !== lowerIsBetter ? "better" : "worse";
}

function TeamHeaderCard({ team, data, scoutersPerRobot, color, other }: {
  team: TeamDashboard;
  data: EventData;
  scoutersPerRobot: 1 | 2;
  /** Set when comparing, to tie the card to the team's curves. */
  color?: string;
  /** Compare mode: the other team, whose stats this card's are colored against. */
  other?: TeamDashboard;
}) {
  const { quant } = teamRows(data, team);
  const tone = (stat: keyof typeof COMPARED_STATS) => compareTone(stat, team, other);
  // One submission per played qualification match, or two when the event is double scouted.
  const playedMatches = team.recentMatches?.length ?? team.qualMatches.filter((match) => match.status === "played").length;
  const expectedSubmissions = playedMatches * scoutersPerRobot;

  return (
    <Card className="@container gap-0 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <TeamLogo teamNumber={team.teamNumber} className="h-14 w-14 shrink-0 rounded-md border bg-muted object-contain" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-mono text-3xl font-black tabular-nums" style={color ? { color } : undefined}>
            {color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />}
            {team.teamNumber}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{team.name ?? "Unknown team"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 @xl:grid-cols-2">
        {team.photoUrl ? (
          // Padded so the photo never touches the frame, whichever way it's letterboxed.
          // self-start keeps the frame from stretching to the taller stats column beside it.
          <a href={team.photoUrl} target="_blank" rel="noreferrer" className="block self-start overflow-hidden rounded-md bg-muted p-2">
            <img src={team.photoUrl} alt={`Team ${team.teamNumber}'s robot`} className="block aspect-video w-full rounded object-contain" />
          </a>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 self-start rounded-md bg-muted text-xs text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            No robot photo
          </div>
        )}
        <div className="grid grid-cols-2 content-start gap-x-4 gap-y-3">
          <Stat label="Avg auto fuel" value={team.autoFuel ? formatNumber(team.autoFuel.mean) : ""} detail={spreadDetail(team.autoFuel)} tone={tone("autoFuel")} />
          <Stat label="Avg teleop fuel" value={team.teleopFuel ? formatNumber(team.teleopFuel.mean) : ""} detail={spreadDetail(team.teleopFuel)} tone={tone("teleopFuel")} />
          <Stat label="Avg total points" value={team.totalPoints ? formatNumber(team.totalPoints.mean) : ""} detail={spreadDetail(team.totalPoints)} tone={tone("totalPoints")} />
          <Stat
            label="Avg climb"
            tone={tone("climb")}
            value={team.averageClimb != null ? formatNumber(team.averageClimb) : ""}
            detail={team.climbMatches > 0 ? `${team.climbMatches} match${team.climbMatches === 1 ? "" : "es"} reported` : undefined}
          />
          <Stat
            label="Error rate"
            tone={tone("errorRate")}
            value={team.errorRate ? `${Math.round((team.errorRate.problems / team.errorRate.submissions) * 100)}%` : ""}
            detail={team.errorRate ? `${team.errorRate.problems} of ${team.errorRate.submissions} submissions` : undefined}
          />
          <Stat
            label="DC ELO"
            value={formatElo(team.defenseElo.rating)}
            // A rating builds up over every ranking, so it isn't limited to recent matches.
            detail={`${defenseEloDetail(team.defenseElo)}${team.recentMatches ? " · whole event" : ""}`}
            tone={tone("defenseElo")}
          />
          <Stat label="Submissions" value={`${quant.length} / ${expectedSubmissions}`} />
        </div>
      </div>
    </Card>
  );
}

const ZOOM_HINT = " Pinch or ctrl+scroll a chart to zoom, then drag to pan; double-click to reset.";

/** Auto and teleop fuel curves: one team's alone, or compared teams' overlaid. */
function FuelCard({ entries }: { entries: Array<{ team: TeamDashboard; color: string }> }) {
  const series = (pick: (match: TeamDashboard["matchFuel"][number]) => number, stats: (team: TeamDashboard) => MeanAndSpread | null) =>
    entries.map(({ team, color }) => ({
      name: String(team.teamNumber),
      color,
      stats: stats(team),
      matches: team.matchFuel.map((match) => ({ label: matchLabel(match.matchNumber), value: pick(match) })),
    }));

  return (
    <Card className="@container gap-0 p-4 sm:p-5">
      <SectionTitle>Fuel distribution</SectionTitle>
      <div className="grid gap-6 @xl:grid-cols-2">
        <FuelDistributionChart title="Auto fuel" series={series((match) => match.auto, (team) => team.autoFuel)} />
        <FuelDistributionChart title="Teleop fuel" series={series((match) => match.teleop, (team) => team.teleopFuel)} />
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {entries.length === 1
          ? "Normal curve from the scouted average and standard deviation; the darker band is ±1 SD. Dots are individual scouted matches."
          : "Each team's normal curve from its scouted average and standard deviation, on a shared scale. Dots are individual scouted matches."}
        {entries.some(({ team }) => team.recentMatches) && ` Only each team's last ${RECENT_MATCH_COUNT} scouted matches count.`}
        {ZOOM_HINT}
      </p>
    </Card>
  );
}

/** Fuel-by-match line colors by compare slot (src/index.css): blue, then orange. */
const FUEL_LINE_COLORS = [
  { auto: "var(--fuel-a-auto)", teleop: "var(--fuel-a-teleop)" },
  { auto: "var(--fuel-b-auto)", teleop: "var(--fuel-b-teleop)" },
] as const;

/** Auto and teleop fuel per qualification match: one team's, or compared teams' on a shared match axis. */
function FuelByMatchCard({ teams }: { teams: TeamDashboard[] }) {
  const [alignPreference, setAlignPreference] = useState(false);
  // Aligning only helps line up compared teams; a single team keeps the qualification axis.
  const comparing = teams.length > 1;
  const alignByTeamMatch = comparing && alignPreference;
  const series = teams.map((team, slot) => {
    // Every match stays on the chart; ones outside the recent window just fade.
    const matches = team.allMatchFuel.filter((match): match is typeof match & { matchNumber: number } => match.matchNumber != null);
    const scouted = new Set(matches.map((match) => match.matchNumber));
    return {
      name: String(team.teamNumber),
      colors: FUEL_LINE_COLORS[slot],
      matches,
      missing: team.qualMatches
        .filter((match) => match.status === "played" && !scouted.has(match.matchNumber))
        .map((match) => match.matchNumber),
      highlight: team.recentMatches,
    };
  });

  return (
    <Card className="gap-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <SectionTitle>Fuel by match</SectionTitle>
        {comparing && (
          <div className="flex items-center gap-2">
            <Label htmlFor="fuel-align-team-match" className="text-xs font-normal text-muted-foreground">Align by team match</Label>
            <Switch id="fuel-align-team-match" checked={alignPreference} onCheckedChange={setAlignPreference} />
          </div>
        )}
      </div>
      <FuelByMatchChart series={series} alignByTeamMatch={alignByTeamMatch} />
      <p className="mt-3 text-[10px] text-muted-foreground">
        Co-scouted matches are averaged. Dotted lines bridge played matches with no scouting, following the trend between the scouted matches on either side.
        {alignByTeamMatch && " Aligned: #1 is each team's first played qualification match, #2 its second, and so on."}
        {teams.some((team) => team.recentMatches) && ` Matches before each team's last ${RECENT_MATCH_COUNT} scouted are faded.`}
        {ZOOM_HINT}
      </p>
    </Card>
  );
}

function PitCard({ team, data, compareKey }: { team: TeamDashboard; data: EventData; compareKey?: CompareKey }) {
  const { pit } = teamRows(data, team);
  const pitValue = (key: keyof PitRow) => (pit.find((row) => row[key])?.[key] as string | undefined) ?? "";
  const autoDescription = pitValue("autoDescription");
  const pitNotes = pitValue("notes");

  return (
    <Card className="@container gap-0 p-4 sm:p-5">
      <SectionTitle compareKey={compareKey}>Robot (pit scouting)</SectionTitle>
      {pit.length === 0 ? (
        <p className="text-sm text-muted-foreground">This team hasn't been pit scouted yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 @md:grid-cols-3">
            {PIT_FIELDS.map((field) => (
              <Stat key={field.key} label={field.label} value={pitValue(field.key)} />
            ))}
          </div>
          {(autoDescription || pitNotes) && (
            <div className="mt-4 space-y-3 border-t border-border pt-3 text-sm">
              {autoDescription && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Auto paths</div>
                  <p className="whitespace-pre-wrap break-words">{autoDescription}</p>
                </div>
              )}
              {pitNotes && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                  <p className="whitespace-pre-wrap break-words">{pitNotes}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function MatchByMatchCard({ team, data, compareKey }: { team: TeamDashboard; data: EventData; compareKey?: CompareKey }) {
  const { quant } = teamRows(data, team);
  return (
    <Card className="gap-0 p-4 sm:p-5">
      <SectionTitle compareKey={compareKey}>Match by match</SectionTitle>
      {quant.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {team.recentMatches ? `No quantitative scouting in this team's last ${RECENT_MATCH_COUNT} matches.` : "No quantitative scouting for this team yet."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Match</TableHead>
              <TableHead>Scout</TableHead>
              <TableHead className="text-right">Auto</TableHead>
              <TableHead className="text-right">Teleop</TableHead>
              <TableHead>Auto climb</TableHead>
              <TableHead>Endgame climb</TableHead>
              <TableHead className="text-right">Points</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quant.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono tabular-nums">{row.matchNumber != null ? `Q${row.matchNumber}` : "—"}</TableCell>
                <TableCell className="max-w-32 truncate">{row.scouterName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.autoShots}</TableCell>
                <TableCell className="text-right tabular-nums">{row.teleopShots}</TableCell>
                <TableCell>{climbLabel(row.autoClimb)}</TableCell>
                <TableCell>{climbLabel(row.endgameClimb)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{row.totalPoints}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function NotesCard({ team, compareKey }: { team: TeamDashboard; compareKey?: CompareKey }) {
  return (
    <Card className="@container gap-0 p-4 sm:p-5">
      <SectionTitle compareKey={compareKey}>Scout notes</SectionTitle>
      <div className="grid gap-5 @xl:grid-cols-2">
        <NoteSection title="Comments" notes={team.comments} />
        <NoteSection title="Robot problems" notes={team.robotProblems} />
        <NoteSection title="Defense" notes={team.defense} />
        <NoteSection title="Qualitative comments" notes={team.qualComments} />
      </div>
    </Card>
  );
}

/** Everything the event's scouting data says about one team. */
export function TeamSummary({ team, data, scoutersPerRobot, onSelectTeam }: {
  team: TeamDashboard;
  data: EventData;
  scoutersPerRobot: 1 | 2;
  onSelectTeam: (teamNumber: number) => void;
}) {
  return (
    <div className="space-y-4">
      <TeamHeaderCard team={team} data={data} scoutersPerRobot={scoutersPerRobot} />
      <FuelCard entries={[{ team, color: "var(--compare-a)" }]} />
      <FuelByMatchCard teams={[team]} />
      <MatchList teamNumber={team.teamNumber} schedule={data.schedule} recentMatches={team.recentMatches} onSelectTeam={onSelectTeam} />
      <PitCard team={team} data={data} />
      <MatchByMatchCard team={team} data={data} />
      <NotesCard team={team} />
    </div>
  );
}

/**
 * Two teams' summaries section by section in side-by-side columns (stacked per
 * section on phones), with their fuel curves overlaid across the full width.
 */
function TeamComparison({ teams, data, scoutersPerRobot, onSelectTeam }: {
  teams: [TeamDashboard, TeamDashboard];
  data: EventData;
  scoutersPerRobot: 1 | 2;
  /** A team clicked in one side's match list replaces that side's team. */
  onSelectTeam: (slot: 0 | 1, teamNumber: number) => void;
}) {
  const keys = teams.map((team, i) => ({ teamNumber: team.teamNumber, color: COMPARE_COLORS[i] }));
  const pair = (render: (team: TeamDashboard, slot: 0 | 1) => React.ReactNode) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {teams.map((team, i) => <Fragment key={team.teamNumber}>{render(team, i as 0 | 1)}</Fragment>)}
    </div>
  );

  return (
    <div className="space-y-4">
      {pair((team, slot) => (
        <TeamHeaderCard team={team} data={data} scoutersPerRobot={scoutersPerRobot} color={keys[slot].color} other={teams[1 - slot]} />
      ))}
      <FuelCard entries={teams.map((team, i) => ({ team, color: COMPARE_COLORS[i] }))} />
      <FuelByMatchCard teams={teams} />
      {pair((team, slot) => (
        <MatchList
          teamNumber={team.teamNumber}
          schedule={data.schedule}
          recentMatches={team.recentMatches}
          onSelectTeam={(teamNumber) => onSelectTeam(slot, teamNumber)}
          compareKey={keys[slot]}
          otherTeam={teams[1 - slot].teamNumber}
        />
      ))}
      {pair((team, slot) => <PitCard team={team} data={data} compareKey={keys[slot]} />)}
      {pair((team, slot) => <MatchByMatchCard team={team} data={data} compareKey={keys[slot]} />)}
      {pair((team, slot) => <NotesCard team={team} compareKey={keys[slot]} />)}
    </div>
  );
}

/**
 * Every team at the selected event in a narrow scrollable list on the left;
 * picking one shows its full summary from the event's scouting data in the rest.
 * In compare mode the list picks two teams, shown side by side. Phones show one
 * side at a time.
 */
export function TeamInfoPage({ event, userId, userName, devMode }: {
  event: Event | undefined;
  userId: string | undefined;
  userName: string | null;
  devMode: boolean;
}) {
  // Tagged with the event it was loaded for, so switching events shows the loading state.
  const [loaded, setLoaded] = useState<{ eventId: string; data: EventData | null; error: string | null } | null>(() => cachedEventLoad(event));
  // The viewed team lives in the address (?team=254), so the match dashboard can link to it
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedNumber = Number(searchParams.get("team")) || null;
  // Opened from a match on the dashboard: its back button returns there. Picking another
  // team (or anything else that rewrites the address) drops this.
  const navigate = useNavigate();
  const fromMatch = (useLocation().state as { fromMatch?: number } | null)?.fromMatch;
  const setSelected = (teamNumber: number | null) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (teamNumber == null) params.delete("team");
        else params.set("team", String(teamNumber));
        return params;
      },
      { replace: true }
    );
  };
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TeamSort>("number");
  const [compare, setCompare] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  // Compare slots stay put, so a team keeps its color when the other one changes.
  const [compared, setCompared] = useState<{ eventId: string; slots: [number | null, number | null] } | null>(null);

  useEffect(() => {
    if (!event) return;
    let mounted = true;
    const sandbox = devMode && userId && isDevEventId(event.id) ? { userId, userName } : null;
    loadEventData(event, sandbox)
      .then((data) => { if (mounted) setLoaded({ eventId: event.id, data, error: null }); })
      .catch((cause) => {
        console.error("Could not load team info data:", cause);
        if (mounted) setLoaded({ eventId: event.id, data: null, error: cause instanceof Error ? cause.message : "Could not load this event's data." });
      });
    return () => { mounted = false; };
  }, [event, userId, userName, devMode]);

  const current = loaded && loaded.eventId === event?.id ? loaded : null;
  const data = current?.data ?? null;

  // The event's TBA team list, plus any team that only shows up in scouting data.
  const teams = useMemo(() => {
    if (!data) return [];
    const numbers = new Set<number>(data.schedule.teamNames.keys());
    [...data.quant, ...data.pit].forEach((row) => { if (row.teamNumber != null) numbers.add(row.teamNumber); });
    // The list's averages follow the filter too, so they match the summaries.
    return [...numbers].map((teamNumber) => buildTeamDashboard(teamNumber, data, { lastMatches: recentOnly ? RECENT_MATCH_COUNT : undefined }));
  }, [data, recentOnly]);

  const visibleTeams = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matching = search
      ? teams.filter((team) => String(team.teamNumber).startsWith(search) || team.name?.toLowerCase().includes(search))
      : teams;
    // Unscouted teams sort last when ranking by points.
    return [...matching].sort((a, b) => sort === "points"
      ? (b.totalPoints?.mean ?? -1) - (a.totalPoints?.mean ?? -1) || a.teamNumber - b.teamNumber
      : a.teamNumber - b.teamNumber);
  }, [teams, query, sort]);

  const selectedTeam = teams.find((team) => team.teamNumber === selectedNumber) ?? null;

  const slots: [number | null, number | null] = compared && compared.eventId === event?.id ? compared.slots : [null, null];
  const comparedTeams = slots.map((teamNumber) => teams.find((team) => team.teamNumber === teamNumber) ?? null);
  const comparePair = comparedTeams[0] && comparedTeams[1] ? [comparedTeams[0], comparedTeams[1]] as [TeamDashboard, TeamDashboard] : null;
  const showDetail = compare ? comparePair !== null : selectedTeam !== null;

  // A new team's summary starts at the top: the detail pane scrolls on its own
  // on md+, and phones scroll the whole page.
  const detailRef = useRef<HTMLDivElement>(null);
  const viewKey = compare ? `compare:${slots.join(",")}` : `team:${selectedTeam?.teamNumber}`;
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [viewKey]);

  if (!event) return <p className="text-muted-foreground">Select an event.</p>;
  if (current?.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{current.error}</span>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading event data...
      </p>
    );
  }
  if (teams.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">No teams found for the selected event.</p>
      </Card>
    );
  }

  const setSlots = (next: [number | null, number | null]) => setCompared({ eventId: event.id, slots: next });

  // Turning compare on starts from the team being viewed; turning it off views the first compared team.
  const toggleCompare = (on: boolean) => {
    setCompare(on);
    if (on) {
      setSlots([selectedTeam?.teamNumber ?? null, null]);
    } else {
      const keep = slots[0] ?? slots[1];
      setSelected(keep);
    }
  };

  // Clicking a compared team removes it; otherwise it fills the first empty slot, or replaces the second.
  const pickForCompare = (teamNumber: number) => {
    const index = slots.indexOf(teamNumber);
    if (index !== -1) setSlots(index === 0 ? [null, slots[1]] : [slots[0], null]);
    else if (slots[0] == null) setSlots([teamNumber, slots[1]]);
    else setSlots([slots[0], teamNumber]);
  };

  // A team clicked in one side's match list takes that side; picking the other side's team swaps them.
  const replaceSlot = (slot: 0 | 1, teamNumber: number) => {
    const next: [number | null, number | null] = [...slots];
    if (next[1 - slot] === teamNumber) next[1 - slot] = next[slot];
    next[slot] = teamNumber;
    setSlots(next);
  };

  return (
    // On md+ both columns scroll on their own within the viewport, above the floating page nav.
    <div className="mb-20 md:grid md:h-[calc(100dvh-16rem)] md:min-h-96 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-4">
      <Card className={`min-h-0 gap-0 py-0 ${showDetail ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-1.5 border-b border-border p-1.5">
          <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
            <Label htmlFor="compare-teams" className="text-xs">Compare</Label>
            <Switch id="compare-teams" checked={compare} onCheckedChange={toggleCompare} />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams"
              aria-label="Search teams"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-1 pl-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {visibleTeams.length} team{visibleTeams.length === 1 ? "" : "s"} · avg pts
            </span>
            <Select value={sort} onValueChange={(value) => setSort(value as TeamSort)}>
              <SelectTrigger size="sm" className="h-7 w-auto gap-1 px-2 text-xs" aria-label="Sort teams">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="points">Points</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-px overflow-y-auto p-1">
          {visibleTeams.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No teams match "{query}".</p>
          ) : (
            visibleTeams.map((team) => {
              const slot = slots.indexOf(team.teamNumber);
              return compare ? (
                <TeamListItem
                  key={team.teamNumber}
                  team={team}
                  selected={slot !== -1}
                  onSelect={() => pickForCompare(team.teamNumber)}
                  compareColor={slot !== -1 ? COMPARE_COLORS[slot] : null}
                />
              ) : (
                <TeamListItem
                  key={team.teamNumber}
                  team={team}
                  selected={team.teamNumber === selectedTeam?.teamNumber}
                  onSelect={() => setSelected(team.teamNumber)}
                />
              );
            })
          )}
        </div>
      </Card>

      <div ref={detailRef} className={`min-h-0 md:overflow-y-auto ${showDetail ? "block" : "hidden md:block"}`}>
        {showDetail && (
          <div className="mb-2 flex items-center gap-2">
            {fromMatch && !compare ? (
              // Back through history, so the dashboard reopens that match as it was
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4" />Match {fromMatch}
              </Button>
            ) : (
              // Back to the list keeps the first compared team picked.
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => (compare ? setSlots([slots[0], null]) : setSelected(null))}>
                <ArrowLeft className="h-4 w-4" />All teams
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="recent-matches" className="text-xs">Last {RECENT_MATCH_COUNT} matches only</Label>
              <Switch id="recent-matches" checked={recentOnly} onCheckedChange={setRecentOnly} />
            </div>
          </div>
        )}
        {compare ? (
          comparePair ? (
            <TeamComparison
              teams={comparePair}
              data={data}
              scoutersPerRobot={event.scouters_per_robot ?? 2}
              onSelectTeam={replaceSlot}
            />
          ) : (
            <Card className="flex h-full items-center justify-center p-8 text-center">
              <p className="text-muted-foreground">
                {slots[0] ?? slots[1]
                  ? `Pick another team to compare with ${slots[0] ?? slots[1]}.`
                  : "Pick two teams from the list to compare them."}
              </p>
            </Card>
          )
        ) : selectedTeam ? (
          <TeamSummary
            team={selectedTeam}
            data={data}
            // Events from before the setting existed are double scouted.
            scoutersPerRobot={event.scouters_per_robot ?? 2}
            onSelectTeam={setSelected}
          />
        ) : (
          <Card className="flex h-full items-center justify-center p-8 text-center">
            <p className="text-muted-foreground">Select a team to see its summary.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
