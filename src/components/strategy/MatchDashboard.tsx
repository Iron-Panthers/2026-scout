import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ImageOff, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isDevEventId } from "@/lib/devMode";
import {
  ORDINALS,
  buildTeamDashboard,
  defenseEloDetail,
  formatElo,
  formatNumber,
  loadEventData,
  type AllianceBreakdown,
  type EventData,
  type MatchStatus,
  type MeanAndSpread,
  type QualScheduleMatch,
  type TeamDashboard,
  type TeamNote,
} from "@/lib/strategyData";
import type { Event } from "@/types";

const ALLIANCES = [
  { key: "red", label: "Red alliance", heading: "text-red-500", border: "border-t-red-500" },
  { key: "blue", label: "Blue alliance", heading: "text-blue-500", border: "border-t-blue-500" },
] as const;

const MATCH_STATUS_TEXT: Record<MatchStatus, string> = {
  played: "text-green-600 dark:text-green-400",
  current: "text-yellow-600 dark:text-yellow-400",
  upcoming: "text-red-600 dark:text-red-400",
};

// Compact mode fits all six robots in one row, which only works on screens
// wider than they are tall, so portrait screens never get the option.
const LANDSCAPE_QUERY = "(orientation: landscape)";
const COMPACT_STORAGE_KEY = "match-dashboard-compact";

function useIsLandscape() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(LANDSCAPE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(LANDSCAPE_QUERY).matches
  );
}

function readCompactPreference() {
  try {
    return localStorage.getItem(COMPACT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCompactPreference(compact: boolean) {
  try {
    localStorage.setItem(COMPACT_STORAGE_KEY, String(compact));
  } catch {
    // Storage can be unavailable (private windows); the toggle still works for this visit.
  }
}

// Cards size to their column, from ~110px (three across on a phone) up to
// ~400px, so their spacing follows the card's own width (container queries).
const CARD_PAD_X = "px-2 @[12rem]:px-3 @[16rem]:px-4";

export type StatTone = "better" | "worse" | "tied";

const STAT_TONE: Record<StatTone, { className: string; label: string }> = {
  better: { className: "text-green-600 dark:text-green-400", label: "better" },
  worse: { className: "text-red-600 dark:text-red-400", label: "worse" },
  tied: { className: "text-yellow-600 dark:text-yellow-400", label: "tied" },
};

export function Stat({ label, value, detail, tone }: {
  label: string;
  value: string;
  detail?: string;
  /** Compare mode: colors the value by how it stacks up against the other team's. */
  tone?: StatTone | null;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`break-words text-sm font-semibold tabular-nums ${tone ? STAT_TONE[tone].className : ""}`}>
        {value || "—"}
        {tone && <span className="sr-only"> ({STAT_TONE[tone].label})</span>}
      </div>
      {detail && <div className="text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

function spreadStats(label: string, stats: MeanAndSpread | null) {
  return [
    <Stat key={`${label}-avg`} label={`Avg ${label}`} value={stats ? formatNumber(stats.mean) : ""} />,
    <Stat key={`${label}-sd`} label={`${label} SD`} value={stats?.sd != null ? formatNumber(stats.sd) : ""} detail={stats && stats.sd == null ? "Needs 2+ matches" : undefined} />,
  ];
}

function NoteList({ title, notes, compact }: { title: string; notes: TeamNote[]; compact: boolean }) {
  // Compact cards drop empty lists entirely instead of reserving space for them.
  if (compact && notes.length === 0) return null;
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        {title}
        <span className="rounded bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{notes.length}</span>
      </h4>
      {/* Fixed height so every list lines up across the team cards, however many notes each has.
          Compact cards hide empty lists, so they can't line up anyway and only cap the height. */}
      {notes.length === 0 ? (
        <p className="h-48 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className={`${compact ? "max-h-48" : "h-48"} space-y-1.5 overflow-y-auto pr-1`}>
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

function TeamCard({ team, station, border, compact, selectedMatch, onSelectMatch, onOpenPhoto }: {
  team: TeamDashboard;
  station: string;
  border: string;
  compact: boolean;
  selectedMatch: number;
  onSelectMatch: (matchNumber: number) => void;
  onOpenPhoto: (team: TeamDashboard) => void;
}) {
  const noteLists = [
    { title: "Comments", notes: team.comments },
    { title: "Robot problems", notes: team.robotProblems },
    { title: "Defense", notes: team.defense },
    { title: "Qualitative comments", notes: team.qualComments },
  ];
  const showNotes = !compact || noteLists.some((list) => list.notes.length > 0);

  return (
    <Card className={`@container min-w-0 gap-0 overflow-hidden border-t-4 py-0 ${border}`}>
      <div className={`flex flex-col-reverse gap-x-2 pt-2 @[12rem]:flex-row @[12rem]:items-baseline @[12rem]:justify-between @[16rem]:pt-3 ${CARD_PAD_X}`}>
        <div className="min-w-0">
          <div className="font-mono text-lg font-black tabular-nums @[12rem]:text-xl @[16rem]:text-2xl">{team.teamNumber}</div>
          <div className="truncate text-xs text-muted-foreground @[16rem]:text-sm" title={team.name ?? undefined}>{team.name ?? "Unknown team"}</div>
        </div>
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground @[16rem]:text-xs">{station}</span>
      </div>

      <div className={`pt-2 @[16rem]:pt-3 ${CARD_PAD_X}`}>
        {team.photoUrl ? (
          <button
            type="button"
            onClick={() => onOpenPhoto(team)}
            className="block w-full cursor-zoom-in overflow-hidden rounded-md bg-muted"
            aria-label={`View team ${team.teamNumber}'s robot photo`}
          >
            <img src={team.photoUrl} alt={`Team ${team.teamNumber}'s robot`} className="aspect-video w-full object-contain" loading="lazy" />
          </button>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            No robot photo
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-x-4 gap-y-2 pt-2 @[16rem]:grid-cols-2 @[16rem]:gap-y-2.5 @[16rem]:pt-3 ${CARD_PAD_X}`}>
        {spreadStats("auto fuel", team.autoFuel)}
        {spreadStats("teleop fuel", team.teleopFuel)}
        <Stat
          label="Avg climb"
          value={team.averageClimb != null ? formatNumber(team.averageClimb) : ""}
          detail={team.climbMatches > 0 ? `${team.climbMatches} match${team.climbMatches === 1 ? "" : "es"} reported` : undefined}
        />
        <Stat
          label="Error rate"
          value={team.errorRate ? `${Math.round((team.errorRate.problems / team.errorRate.submissions) * 100)}%` : ""}
          detail={team.errorRate ? `${team.errorRate.problems} of ${team.errorRate.submissions} submissions` : undefined}
        />
        <Stat label="DC ELO" value={formatElo(team.defenseElo.rating)} detail={defenseEloDetail(team.defenseElo)} />
        <Stat label="Shooter type" value={team.shooterType} />
        <Stat label="Height" value={team.terrain} />
      </div>
      <p className={`pb-3 pt-2 text-[10px] text-muted-foreground ${CARD_PAD_X}`}>
        {team.matchesScouted} match{team.matchesScouted === 1 ? "" : "es"} scouted
      </p>

      {showNotes && (
        <div className={`divide-y divide-border border-t border-border py-3 ${CARD_PAD_X}`}>
          {noteLists.map((list) => (
            <NoteList key={list.title} title={list.title} notes={list.notes} compact={compact} />
          ))}
        </div>
      )}

      {/* Pinned to the bottom, so it lines up across compact mode's equal-height cards. */}
      <div className={`mt-auto border-t border-border py-3 ${CARD_PAD_X}`}>
        <h4 className="mb-1.5 text-xs font-semibold">Qualification matches</h4>
        <div className="flex flex-wrap gap-1">
          {team.qualMatches.map((match) => (
            <button
              key={match.matchNumber}
              type="button"
              onClick={() => onSelectMatch(match.matchNumber)}
              title={`Show match ${match.matchNumber}`}
              className={`rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors ${
                match.alliance === "red"
                  ? "border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300"
                  : "border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300"
              } ${match.status === "played" ? "opacity-60" : ""} ${match.matchNumber === selectedMatch ? "ring-2 ring-ring ring-offset-1 ring-offset-background opacity-100" : ""}`}
            >
              Q{match.matchNumber}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

type SpreadPick = (team: TeamDashboard) => MeanAndSpread | null;

/** Sum of the robots' event averages, formatted; "" when none has data. Unscouted robots add nothing. */
function allianceTotal(teams: TeamDashboard[], pick: SpreadPick) {
  const means = teams.map(pick).filter((stats): stats is MeanAndSpread => stats !== null).map((stats) => stats.mean);
  return means.length > 0 ? formatNumber(means.reduce((sum, mean) => sum + mean, 0)) : "";
}

/** Higher is better for every alliance stat; nothing when either is missing. */
function compareTone(mine: number | null, theirs: number | null): StatTone | null {
  if (mine == null || theirs == null) return null;
  if (mine === theirs) return "tied";
  return mine > theirs ? "better" : "worse";
}

/** Compares the totals as shown (rounded), so values that look equal never get colored. */
const shownTone = (mine: string, theirs: string) => compareTone(mine ? Number(mine) : null, theirs ? Number(theirs) : null);

const OUTCOME = {
  red: { red: "Won", blue: "Lost" },
  blue: { red: "Lost", blue: "Won" },
  tie: { red: "Tied", blue: "Tied" },
} as const;

const OUTCOME_TONE = { Won: "better", Lost: "worse", Tied: "tied" } as const;

/** What the alliance actually scored, from TBA, colored against the opponents' result. */
function AllianceResult({ match, side }: { match: QualScheduleMatch; side: "red" | "blue" }) {
  const other = side === "red" ? "blue" : "red";
  const score = { red: match.redScore, blue: match.blueScore };
  const outcome = match.winner && OUTCOME[match.winner][side];
  const mine = match.breakdown?.[side];
  const theirs = match.breakdown?.[other];
  const stat = (label: string, pick: (breakdown: AllianceBreakdown) => number | null) => {
    const value = mine ? pick(mine) : null;
    return <Stat label={label} value={value != null ? String(value) : ""} tone={compareTone(value, theirs ? pick(theirs) : null)} />;
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">Actual result</h3>
        {outcome && (
          <span className={`text-xs font-semibold ${STAT_TONE[OUTCOME_TONE[outcome]].className}`}>
            {outcome} {score[side]}–{score[other]}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
        {stat("Auto fuel", (breakdown) => breakdown.autoFuel)}
        {stat("Teleop fuel", (breakdown) => breakdown.teleopFuel)}
        <Stat label="Total points" value={score[side] != null ? String(score[side]) : ""} tone={compareTone(score[side], score[other])} />
        {stat("Tower points", (breakdown) => breakdown.towerPoints)}
        {stat("Foul points", (breakdown) => breakdown.foulPoints)}
        {stat("Ranking points", (breakdown) => breakdown.rankingPoints)}
      </div>
    </div>
  );
}

/**
 * An alliance's expected output: each stat is the sum of its robots' event averages,
 * colored against the opponents'. Once the match is played, its actual result follows.
 */
function AllianceSummary({ label, heading, border, teams, opponents, match, side }: {
  label: string;
  heading: string;
  border: string;
  teams: TeamDashboard[];
  opponents: TeamDashboard[];
  match: QualScheduleMatch;
  side: "red" | "blue";
}) {
  const stat = (statLabel: string, pick: SpreadPick) => {
    const value = allianceTotal(teams, pick);
    return <Stat label={statLabel} value={value} tone={shownTone(value, allianceTotal(opponents, pick))} />;
  };
  // The detail line says how many robots the totals cover.
  const scouted = teams.filter((team) => team.matchesScouted > 0).length;

  return (
    <Card className={`min-w-0 gap-0 border-t-4 px-3 py-3 sm:px-4 ${border}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className={`text-sm font-bold uppercase tracking-wide ${heading}`}>{label}</h2>
        <span className="text-[10px] text-muted-foreground">
          {scouted === teams.length ? `All ${teams.length} robots scouted` : `${scouted} of ${teams.length} robots scouted`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
        {stat("Avg auto fuel", (team) => team.autoFuel)}
        {stat("Avg teleop fuel", (team) => team.teleopFuel)}
        {stat("Avg total points", (team) => team.totalPoints)}
      </div>
      {match.status === "played" && <AllianceResult match={match} side={side} />}
    </Card>
  );
}

/**
 * The selected event's match picker (rendered into `toolbarSlot`, beside the
 * event dropdown) and, for the chosen qualification match, each alliance's
 * summed averages plus a card per team with its stats and notes from the whole event.
 */
export function MatchDashboard({ event, userId, userName, devMode, toolbarSlot }: {
  event: Event | undefined;
  userId: string | undefined;
  userName: string | null;
  devMode: boolean;
  toolbarSlot: HTMLElement | null;
}) {
  // Tagged with the event it was loaded for, so switching events shows the loading state.
  const [loaded, setLoaded] = useState<{ eventId: string; data: EventData | null; error: string | null } | null>(null);
  const [selected, setSelected] = useState<{ eventId: string; matchNumber: number } | null>(null);
  const [photoTeam, setPhotoTeam] = useState<TeamDashboard | null>(null);
  const [compactPreference, setCompactPreference] = useState(readCompactPreference);
  const isLandscape = useIsLandscape();
  const compact = compactPreference && isLandscape;

  useEffect(() => {
    if (!event) return;
    let mounted = true;
    const sandbox = devMode && userId && isDevEventId(event.id) ? { userId, userName } : null;
    loadEventData(event, sandbox)
      .then((data) => { if (mounted) setLoaded({ eventId: event.id, data, error: null }); })
      .catch((cause) => {
        console.error("Could not load match dashboard data:", cause);
        if (mounted) setLoaded({ eventId: event.id, data: null, error: cause instanceof Error ? cause.message : "Could not load this event's data." });
      });
    return () => { mounted = false; };
  }, [event, userId, userName, devMode]);

  const current = loaded && loaded.eventId === event?.id ? loaded : null;
  const data = current?.data ?? null;
  const matches = data?.schedule.matches ?? [];
  // Until a match is picked for this event, show the next one to be played.
  const matchNumber = selected && selected.eventId === event?.id
    ? selected.matchNumber
    : (matches.find((match) => match.status !== "played") ?? matches[matches.length - 1])?.matchNumber;
  const match = matches.find((item) => item.matchNumber === matchNumber);

  const teams = useMemo(() => {
    if (!data || !match) return null;
    return {
      red: match.red.map((teamNumber) => buildTeamDashboard(teamNumber, data)),
      blue: match.blue.map((teamNumber) => buildTeamDashboard(teamNumber, data)),
    };
  }, [data, match]);

  const selectMatch = (value: number) => {
    if (event) setSelected({ eventId: event.id, matchNumber: value });
  };

  const setCompact = (value: boolean) => {
    setCompactPreference(value);
    saveCompactPreference(value);
  };

  const matchPicker = toolbarSlot && createPortal(
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:flex-none">
      {isLandscape && (
        <div className="flex shrink-0 items-center gap-2">
          <Switch id="match-dashboard-compact" checked={compactPreference} onCheckedChange={setCompact} />
          <Label htmlFor="match-dashboard-compact" className="whitespace-nowrap">Compact mode</Label>
        </div>
      )}
      <Select
        value={matchNumber != null ? String(matchNumber) : undefined}
        onValueChange={(value) => selectMatch(Number(value))}
        disabled={matches.length === 0}
      >
        <SelectTrigger className="w-full min-w-0 flex-1 sm:w-64 sm:flex-none" aria-label="Match">
          <SelectValue placeholder="Select match" />
        </SelectTrigger>
        <SelectContent>
          {matches.map((item) => (
            <SelectItem key={item.matchNumber} value={String(item.matchNumber)}>
              {/* Colored inside the item text so the trigger shows the selected match's color too. */}
              <span className={MATCH_STATUS_TEXT[item.status]}>Qualification {item.matchNumber}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>,
    toolbarSlot
  );

  let body;
  if (!event) {
    body = <p className="text-muted-foreground">Select an event.</p>;
  } else if (current?.error) {
    body = (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{current.error}</span>
      </div>
    );
  } else if (!data) {
    body = (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading event data...
      </p>
    );
  } else if (!teams) {
    body = (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">No qualification schedule has been published for this event yet.</p>
      </Card>
    );
  } else {
    body = (
      // Bottom margin keeps the last cards clear of the floating page nav.
      <div className="mb-20 space-y-6">
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:gap-4">
          {ALLIANCES.map((alliance) => (
            <AllianceSummary
              key={alliance.key}
              label={alliance.label}
              heading={alliance.heading}
              border={alliance.border}
              teams={teams[alliance.key]}
              opponents={teams[alliance.key === "red" ? "blue" : "red"]}
              match={match!}
              side={alliance.key}
            />
          ))}
        </div>
        {/* Each alliance's three robots sit side by side; red stacks above blue,
            until wide screens (or compact mode) put both alliances (all six robots) in one row. */}
        <div className={compact ? "grid grid-cols-2 gap-2 sm:gap-3" : "grid gap-6 xl:grid-cols-2 xl:gap-4"}>
          {ALLIANCES.map((alliance) => (
            <section key={alliance.key} className={compact ? "flex min-w-0 flex-col" : "min-w-0"}>
              <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${alliance.heading}`}>{alliance.label}</h2>
              {/* Compact mode stretches every card to the tallest of all six; otherwise each keeps its own height. */}
              <div className={`grid grid-cols-3 gap-2 ${compact ? "flex-1 items-stretch" : "items-start sm:gap-3"}`}>
                {teams[alliance.key].map((team, index) => (
                  <TeamCard
                    key={team.teamNumber}
                    team={team}
                    station={`${alliance.key === "red" ? "Red" : "Blue"} ${index + 1}`}
                    border={alliance.border}
                    compact={compact}
                    selectedMatch={match!.matchNumber}
                    onSelectMatch={selectMatch}
                    onOpenPhoto={setPhotoTeam}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {matchPicker}
      {body}
      <Dialog open={photoTeam !== null} onOpenChange={(open) => { if (!open) setPhotoTeam(null); }}>
        <DialogContent className="sm:max-w-2xl">
          {photoTeam && (
            <>
              <DialogHeader>
                <DialogTitle>Team {photoTeam.teamNumber}</DialogTitle>
                <DialogDescription>{photoTeam.name ?? "Robot photo"}</DialogDescription>
              </DialogHeader>
              <img src={photoTeam.photoUrl ?? undefined} alt={`Team ${photoTeam.teamNumber}'s robot`} className="max-h-[70vh] w-full rounded-md bg-muted object-contain" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
