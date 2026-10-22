import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ImageOff, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MatchVideoDialog } from "@/components/MatchVideoDialog";
import { isDevEventId } from "@/lib/devMode";
import { unlockAchievement } from "@/lib/achievements";
import {
  ORDINALS,
  buildTeamDashboard,
  cachedEventLoad,
  defenseEloDetail,
  formatElo,
  formatNumber,
  loadEventData,
  setMatchVideoLink,
  type EventData,
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

function NoteList({ title, notes }: { title: string; notes: TeamNote[] }) {
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        {title}
        <span className="rounded bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">{notes.length}</span>
      </h4>
      {/* Fixed height so every list lines up across the team cards, however many notes each has. */}
      {notes.length === 0 ? (
        <p className="h-48 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="h-48 space-y-1.5 overflow-y-auto pr-1">
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

function TeamCard({ team, station, border, selectedMatch, onSelectMatch, onOpenPhoto }: {
  team: TeamDashboard;
  station: string;
  border: string;
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
        <Stat label="Weight" value={team.weight} />
      </div>
      <p className={`pb-3 pt-2 text-[10px] text-muted-foreground ${CARD_PAD_X}`}>
        {team.matchesScouted} match{team.matchesScouted === 1 ? "" : "es"} scouted
      </p>

      <div className={`divide-y divide-border border-t border-border py-3 ${CARD_PAD_X}`}>
        {noteLists.map((list) => (
          <NoteList key={list.title} title={list.title} notes={list.notes} />
        ))}
      </div>

      <div className={`border-t border-border py-3 ${CARD_PAD_X}`}>
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

/** Our team: its matches are highlighted in the schedule. */
const OUR_TEAM = 5026;

// Schedule list colors, after The Blue Alliance's match tables: the winning alliance's teams
// and score bright and bold, everything else (the loser, and unplayed matches) a dark shade.
const SCHEDULE_CELL = {
  red: { won: "bg-red-700 font-bold text-white", other: "bg-red-950/70 text-red-50" },
  blue: { won: "bg-blue-600 font-bold text-white", other: "bg-blue-950/70 text-blue-50" },
} as const;

/** One alliance's three teams, spread evenly across a colored block. */
function ScheduleTeams({ color, teams, won, rounded }: { color: "red" | "blue"; teams: number[]; won: boolean; rounded: string }) {
  return (
    <div className={`grid grid-cols-3 items-center py-0 text-center font-mono text-xs leading-5 tabular-nums sm:text-sm sm:leading-none ${rounded} ${SCHEDULE_CELL[color][won ? "won" : "other"]}`}>
      {teams.map((team) => <span key={team} className={team === OUR_TEAM ? "underline underline-offset-2" : undefined}>{team}</span>)}
    </div>
  );
}

/** A score cell: the real score in its alliance's color (bright and bold for the winner). */
function ScoreCell({ color, value, won }: { color: "red" | "blue"; value: number | null; won: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-md font-mono text-xs tabular-nums sm:text-sm sm:leading-none ${SCHEDULE_CELL[color][won ? "won" : "other"]}`}>
      {value ?? "—"}
    </div>
  );
}

// Predicted cells are outlined; the likely winner also gets a soft fill, quieter than the real scores'.
const PREDICTED_CELL = {
  red: { outline: "border-red-500/50 text-red-600 dark:text-red-300", higher: "bg-red-500/20" },
  blue: { outline: "border-blue-500/50 text-blue-600 dark:text-blue-300", higher: "bg-blue-500/20" },
} as const;

/** A predicted-score cell: outlined in its alliance's color, the likely winner softly filled and in bold. */
function PredictedCell({ color, value, higher }: { color: "red" | "blue"; value: string; higher: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-md border font-mono text-[11px] tabular-nums ${PREDICTED_CELL[color].outline} ${higher ? `font-bold ${PREDICTED_CELL[color].higher}` : ""}`}>
      {value || "—"}
    </div>
  );
}

/**
 * Every qualification match at the event, laid out like The Blue Alliance's match tables:
 * both alliances' teams, scores predicted from scouting and, once played, the real scores,
 * with the winner highlighted. Clicking a match opens it.
 */
function MatchSchedule({ matches, dashboards, onSelect }: {
  matches: QualScheduleMatch[];
  dashboards: Map<number, TeamDashboard>;
  onSelect: (matchNumber: number) => void;
}) {
  const nextRef = useRef<HTMLLIElement>(null);
  const nextMatch = matches.find((match) => match.status !== "played")?.matchNumber;
  // Start scrolled to the next match to be played
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // Sum of the robots' average total points from scouting ("" when none are scouted)
  const predicted = (teams: number[]) =>
    allianceTotal(teams.map((team) => dashboards.get(team)).filter((team): team is TeamDashboard => !!team), (team) => team.totalPoints);

  // Match | teams | predicted | score. Each of the last three holds a red and a blue cell:
  // side by side on wider screens (like TBA), stacked red over blue on phones.
  const columns = "grid grid-cols-[2.5rem_minmax(0,1fr)_2.75rem_3rem] sm:grid-cols-[6rem_minmax(0,1fr)_7rem_8rem]";
  const pair = "grid grid-rows-2 gap-0.5 sm:h-full sm:grid-cols-2 sm:grid-rows-1";

  return (
    // Bottom margin keeps the last rows clear of the floating page nav.
    <div className="mb-20 overflow-hidden rounded-lg border border-border bg-card">
      {/* Column headings */}
      <div className={`${columns} items-end gap-x-0.5 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-3`}>
        <span className="text-center">Match</span>
        <span className="text-center">Alliances</span>
        <span className="text-center" title="Predicted scores: each alliance's robots' average total points from scouting">
          <span className="sm:hidden">Pred</span>
          <span className="hidden sm:inline">Predicted</span>
        </span>
        <span className="text-center">Score</span>
      </div>
      <ul className="divide-y divide-border">
        {matches.map((match) => {
          const redPredicted = predicted(match.red);
          const bluePredicted = predicted(match.blue);
          const predictedTone = shownTone(redPredicted, bluePredicted);
          const isNext = match.matchNumber === nextMatch;
          const isOurs = match.red.includes(OUR_TEAM) || match.blue.includes(OUR_TEAM);
          return (
            <li key={match.matchNumber} ref={isNext ? nextRef : undefined}>
              <button
                type="button"
                onClick={() => onSelect(match.matchNumber)}
                // Exactly 25px tall on wider screens (phones stack red over blue, so need two lines)
                className={`${columns} w-full gap-x-1 px-2 py-0.5 text-left sm:h-[25px] transition-colors hover:bg-accent/40 sm:gap-x-2 sm:px-3 ${
                  isNext ? "bg-yellow-500/10" : ""
                }`}
              >
                <span className="flex items-center justify-center text-xs font-medium">
                  <span
                    className={isOurs ? "font-bold text-primary" : undefined}
                    title={isOurs ? `${OUR_TEAM} plays in this match` : undefined}
                  >
                    <span className="hidden sm:inline">Quals&nbsp;</span>
                    <span className="sm:hidden">Q</span>
                    {match.matchNumber}
                  </span>
                </span>
                <div className={pair}>
                  <ScheduleTeams color="red" teams={match.red} won={match.winner === "red"} rounded="rounded-t-md sm:rounded-none sm:rounded-l-md" />
                  <ScheduleTeams color="blue" teams={match.blue} won={match.winner === "blue"} rounded="rounded-b-md sm:rounded-none sm:rounded-r-md" />
                </div>
                <div className={pair}>
                  <PredictedCell color="red" value={redPredicted} higher={predictedTone === "better"} />
                  <PredictedCell color="blue" value={bluePredicted} higher={predictedTone === "worse"} />
                </div>
                <div className={pair}>
                  <ScoreCell color="red" value={match.redScore} won={match.winner === "red"} />
                  <ScoreCell color="blue" value={match.blueScore} won={match.winner === "blue"} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * An alliance's expected output: each stat is the sum of its robots' event averages,
 * colored against the opponents'.
 */
function AllianceSummary({ label, heading, border, teams, opponents }: {
  label: string;
  heading: string;
  border: string;
  teams: TeamDashboard[];
  opponents: TeamDashboard[];
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
    </Card>
  );
}

/**
 * The selected event's match picker (rendered into `toolbarSlot`, beside the
 * event dropdown) and, for the chosen qualification match, each alliance's
 * summed averages plus a card per team with its stats and notes from the whole event.
 */
export function MatchDashboard({ event, userId, userName, devMode, toolbarSlot, canEditVideos }: {
  event: Event | undefined;
  userId: string | undefined;
  userName: string | null;
  devMode: boolean;
  toolbarSlot: HTMLElement | null;
  /** Managers can paste a YouTube link for a match. */
  canEditVideos: boolean;
}) {
  // Tagged with the event it was loaded for, so switching events shows the loading state.
  const [loaded, setLoaded] = useState<{ eventId: string; data: EventData | null; error: string | null } | null>(() => cachedEventLoad(event));
  // The open match lives in the address (?match=12): none means the list of every match
  const [searchParams, setSearchParams] = useSearchParams();
  const matchParam = Number(searchParams.get("match"));
  const [photoTeam, setPhotoTeam] = useState<TeamDashboard | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);

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
  // No (or an unknown) match picked: the list of every match
  const match = matchParam ? matches.find((item) => item.matchNumber === matchParam) : undefined;

  // Every team's scouting summary, for the list's predicted scores
  const dashboards = useMemo(() => {
    const byTeam = new Map<number, TeamDashboard>();
    if (!data) return byTeam;
    for (const item of data.schedule.matches) {
      for (const teamNumber of [...item.red, ...item.blue]) {
        if (!byTeam.has(teamNumber)) byTeam.set(teamNumber, buildTeamDashboard(teamNumber, data));
      }
    }
    return byTeam;
  }, [data]);

  // Analyst: looking at a match here (in the sandbox it's recorded in the sandbox only)
  const viewedMatch = match && event ? `${event.id}:${match.matchNumber}` : null;
  useEffect(() => {
    if (viewedMatch) void unlockAchievement(userId, "match_view");
  }, [viewedMatch, userId]);

  const teams = useMemo(() => {
    if (!data || !match) return null;
    return {
      red: match.red.map((teamNumber) => buildTeamDashboard(teamNumber, data)),
      blue: match.blue.map((teamNumber) => buildTeamDashboard(teamNumber, data)),
    };
  }, [data, match]);

  /**
   * Opens a match. From the list it's a new step in history (so Back returns to the list);
   * switching between matches replaces it.
   */
  const selectMatch = (value: number) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set("match", String(value));
        return params;
      },
      { replace: match !== undefined }
    );
  };
  const showAllMatches = () => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete("match");
        return params;
      },
      { replace: true }
    );
  };

  // Sandbox matches aren't in the database, so they have no link to change.
  const editableVideos = canEditVideos && !!event && !isDevEventId(event.id);
  const saveVideoLink = async (link: string | null) => {
    if (!event || !data || !match) return;
    const updated = await setMatchVideoLink(event, data, match.matchNumber, link);
    setLoaded({ eventId: event.id, data: updated, error: null });
  };

  // Toolbar (left of the event dropdown), only while a match is open: back to the list,
  // and its video when there is one (managers can always open it to paste a link).
  // Matches are picked from the list (or a team card's chips).
  const matchToolbar = toolbarSlot && match && createPortal(
    <div className="flex min-w-0 items-center gap-2">
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={showAllMatches}>
        <ArrowLeft className="h-4 w-4" />
        All matches
      </Button>
      {(match.videos.length > 0 || editableVideos) && (
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setVideoOpen(true)}>
          <Play className="h-4 w-4" />
          {match.videos.length > 0 ? "Video" : "Add video"}
        </Button>
      )}
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
  } else if (matches.length === 0) {
    body = (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">No qualification schedule has been published for this event yet.</p>
      </Card>
    );
  } else if (!teams) {
    body = <MatchSchedule matches={matches} dashboards={dashboards} onSelect={selectMatch} />;
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
            />
          ))}
        </div>
        {/* Each alliance's three robots sit side by side; red stacks above blue
            until the screen is wide enough (lg) to put both alliances (all six robots) in one row. */}
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-4">
          {ALLIANCES.map((alliance) => (
            <section key={alliance.key} className="min-w-0">
              <h2 className={`mb-2 text-sm font-bold uppercase tracking-wide ${alliance.heading}`}>{alliance.label}</h2>
              <div className="grid grid-cols-3 items-start gap-2 sm:gap-3">
                {teams[alliance.key].map((team, index) => (
                  <TeamCard
                    key={team.teamNumber}
                    team={team}
                    station={`${alliance.key === "red" ? "Red" : "Blue"} ${index + 1}`}
                    border={alliance.border}
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
      {matchToolbar}
      {body}
      {match && (
        <MatchVideoDialog
          open={videoOpen}
          onOpenChange={setVideoOpen}
          title={`Quals ${match.matchNumber}`}
          videos={match.videos}
          videoLink={match.videoLink}
          onSaveLink={editableVideos ? saveVideoLink : undefined}
        />
      )}
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
