import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  type PlayoffAlliance,
  type PlayoffScheduleMatch,
  type QualScheduleMatch,
  type ScheduledMatch,
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
          {/* Opens the team's page on the Teams tab (Back, or its "Match" button, returns to this match) */}
          <Link
            to={`?page=teams&team=${team.teamNumber}`}
            state={{ fromMatch: selectedMatch }}
            className="block w-fit font-mono text-lg font-black tabular-nums hover:underline @[12rem]:text-xl @[16rem]:text-2xl"
            title={`View team ${team.teamNumber} on the Teams page`}
          >
            {team.teamNumber}
          </Link>
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

/** One alliance's three teams, spread evenly across a colored block. Each opens its page on the Teams tab. */
function ScheduleTeams({ color, teams, won, rounded }: { color: "red" | "blue"; teams: number[]; won: boolean; rounded: string }) {
  return (
    // Clipped so a team's hover highlight takes the block's own rounded corners
    <div className={`grid h-full grid-cols-3 items-stretch overflow-hidden py-0 text-center font-mono text-[9px] leading-5 tabular-nums sm:text-[11px] sm:leading-none ${rounded} ${SCHEDULE_CELL[color][won ? "won" : "other"]}`}>
      {teams.map((team) => (
        <Link
          key={team}
          to={`?page=teams&team=${team}`}
          title={`View team ${team} on the Teams page`}
          className={`flex items-center justify-center transition-colors hover:bg-white/20 ${team === OUR_TEAM ? "underline underline-offset-2" : ""}`}
        >
          {team}
        </Link>
      ))}
    </div>
  );
}

/** A score cell: the real score in its alliance's color (bright and bold for the winner). */
function ScoreCell({ color, value, won }: { color: "red" | "blue"; value: number | null; won: boolean }) {
  return (
    <div className={`flex items-center justify-center rounded-md font-mono text-[9px] tabular-nums sm:text-[11px] sm:leading-none ${SCHEDULE_CELL[color][won ? "won" : "other"]}`}>
      {value ?? "—"}
    </div>
  );
}

/**
 * Every qualification match at the event, laid out like The Blue Alliance's match tables:
 * both alliances' teams and, once played, the scores, with the winner highlighted. Clicking a
 * match number opens the match; clicking a team opens its page.
 */
function MatchSchedule({ matches, onSelect }: {
  matches: QualScheduleMatch[];
  onSelect: (matchNumber: number) => void;
}) {
  const nextRef = useRef<HTMLLIElement>(null);
  const nextMatch = matches.find((match) => match.status !== "played")?.matchNumber;
  const [watching, setWatching] = useState<QualScheduleMatch | null>(null);
  // The video column only appears once TBA has a video for some match.
  const showVideos = matches.some(hasTbaVideo);
  // Start scrolled to the next match to be played
  useEffect(() => {
    nextRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // [video] | match | teams | score. Each of the last two holds a red and a blue cell:
  // side by side on wider screens (like TBA), stacked red over blue on phones.
  const columns = showVideos
    ? "grid grid-cols-[1.25rem_2.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[1.25rem_6rem_minmax(0,1fr)_8rem]"
    : "grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[6rem_minmax(0,1fr)_8rem]";
  const pair = "grid grid-rows-2 gap-0.5 sm:h-full sm:grid-cols-2 sm:grid-rows-1";

  return (
    <div className="w-full max-w-[600px] overflow-hidden rounded-lg border border-border bg-card lg:min-w-0 lg:max-w-none lg:flex-1 lg:basis-0">
      {/* Column headings */}
      <div className={`${columns} items-end gap-x-0.5 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-3`}>
        {showVideos && <span />}
        <span className="text-center">Match</span>
        <span className="text-center">Alliances</span>
        <span className="text-center">Score</span>
      </div>
      <ul className="divide-y divide-border">
        {matches.map((match) => {
          const isNext = match.matchNumber === nextMatch;
          const isOurs = match.red.includes(OUR_TEAM) || match.blue.includes(OUR_TEAM);
          return (
            <li key={match.matchNumber} ref={isNext ? nextRef : undefined} className="relative">
              <div
                // Exactly 25px tall on wider screens (phones stack red over blue, so need two lines)
                className={`${columns} w-full gap-x-1 px-2 py-0.5 sm:h-[25px] sm:gap-x-2 sm:px-3 ${isNext ? "bg-yellow-500/10" : ""}`}
              >
                {/* Room for the video button, which sits over it */}
                {showVideos && <span />}
                <button
                  type="button"
                  onClick={() => onSelect(match.matchNumber)}
                  className="flex cursor-pointer items-center justify-center rounded text-[11px] font-medium transition-colors hover:bg-accent hover:underline"
                  title={`Open Quals ${match.matchNumber}${isOurs ? ` (${OUR_TEAM} plays in this match)` : ""}`}
                >
                  <span className={isOurs ? "font-bold text-primary" : undefined}>
                    <span className="hidden sm:inline">Quals&nbsp;</span>
                    <span className="sm:hidden">Q</span>
                    {match.matchNumber}
                  </span>
                </button>
                <div className={pair}>
                  <ScheduleTeams color="red" teams={match.red} won={match.winner === "red"} rounded="rounded-t-md sm:rounded-none sm:rounded-l-md" />
                  <ScheduleTeams color="blue" teams={match.blue} won={match.winner === "blue"} rounded="rounded-b-md sm:rounded-none sm:rounded-r-md" />
                </div>
                <div className={pair}>
                  <ScoreCell color="red" value={match.redScore} won={match.winner === "red"} />
                  <ScoreCell color="blue" value={match.blueScore} won={match.winner === "blue"} />
                </div>
              </div>
              {hasTbaVideo(match) && <VideoButton title={`Quals ${match.matchNumber}`} onClick={() => setWatching(match)} />}
            </li>
          );
        })}
      </ul>
      <MatchVideoDialog
        open={watching !== null}
        onOpenChange={(open) => { if (!open) setWatching(null); }}
        title={watching ? `Quals ${watching.matchNumber}` : ""}
        videos={watching?.videos ?? []}
      />
    </div>
  );
}

/** Whether The Blue Alliance has posted a video of the match. */
const hasTbaVideo = (match: ScheduledMatch) => match.videos.some((video) => video.source === "tba");

/**
 * Plays a match's video. It sits over a row's first (video) column, beside the row's
 * own button rather than inside it, so the row's `<li>` must be `relative`.
 */
function VideoButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Watch ${title}`}
      aria-label={`Watch ${title}`}
      className="absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:left-3"
    >
      <Play className="h-3 w-3" />
    </button>
  );
}

/** An alliance's playoff result: won the event, the round it was knocked out in, or the round it's playing now. */
function AllianceResult({ alliance }: { alliance: PlayoffAlliance }) {
  const { status, round } = alliance;
  if (status === "won") return <span className="font-bold text-green-600 dark:text-green-400">Won</span>;
  if (!round) return <span className="text-muted-foreground">—</span>;
  const lost = status === "eliminated";
  return (
    <span className={lost ? "text-muted-foreground" : "text-yellow-600 dark:text-yellow-400"} title={`${lost ? "Knocked out in" : "Playing in"} ${round.name}`}>
      {lost && "Lost "}
      <span className="sm:hidden">{round.short}</span>
      <span className="hidden sm:inline">{round.name}</span>
    </span>
  );
}

/**
 * The playoff alliances from alliance selection: each seed's captain and picks (and any
 * backup robot called in), with the playoff round each was knocked out in.
 */
function AllianceSelection({ alliances, teamNames }: { alliances: PlayoffAlliance[]; teamNames: Map<number, string> }) {
  // Seed | teams | result, sized like the playoff list's columns below it.
  const columns = "grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[4rem_minmax(0,1fr)_7rem]";
  // Room for every alliance's teams, backups included (3 at regionals, 4 at championships).
  const slots = Math.max(...alliances.map((alliance) => alliance.teams.length + (alliance.backup ? 1 : 0)));
  const teamName = (team: number) => teamNames.get(team) ?? `Team ${team}`;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={`${columns} items-end gap-x-0.5 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-3`}>
        <span className="text-center">Seed</span>
        <span className="text-center">Alliances</span>
        <span className="text-center">Result</span>
      </div>
      {alliances.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Alliance selection hasn't happened yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {alliances.map((alliance) => {
            const isOurs = alliance.teams.includes(OUR_TEAM) || alliance.backup?.in === OUR_TEAM;
            return (
              <li
                key={alliance.seed}
                className={`${columns} gap-x-1 px-2 py-0.5 sm:h-[25px] sm:gap-x-2 sm:px-3 ${alliance.status === "eliminated" ? "opacity-60" : ""}`}
              >
                <span
                  className={`flex items-center justify-center text-[11px] font-medium ${isOurs ? "font-bold text-primary" : ""}`}
                  title={isOurs ? `${OUR_TEAM} is on this alliance` : undefined}
                >
                  {alliance.seed}
                </span>
                <div
                  className="grid items-center rounded-md bg-muted text-center font-mono text-[9px] leading-5 tabular-nums sm:text-[11px] sm:leading-none"
                  style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
                >
                  {alliance.teams.map((team, index) => {
                    const replaced = alliance.backup?.out === team;
                    return (
                      <span
                        key={team}
                        title={`${teamName(team)}: ${index === 0 ? "captain" : `pick ${index}`}${replaced ? `, replaced by ${alliance.backup!.in}` : ""}`}
                        className={`${index === 0 ? "font-bold" : ""} ${team === OUR_TEAM ? "underline underline-offset-2" : ""} ${replaced ? "text-muted-foreground line-through" : ""}`}
                      >
                        {team}
                      </span>
                    );
                  })}
                  {alliance.backup && (
                    <span
                      title={`${teamName(alliance.backup.in)}: backup for ${alliance.backup.out}`}
                      className={`italic ${alliance.backup.in === OUR_TEAM ? "underline underline-offset-2" : ""}`}
                    >
                      {alliance.backup.in}
                    </span>
                  )}
                </div>
                <span className="flex items-center justify-center whitespace-nowrap text-[9px] sm:text-[11px]">
                  <AllianceResult alliance={alliance} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "M7" → "Match 7", "F2" → "Finals 2"; older formats' labels (e.g. "QF1-2") as they are. */
const playoffTitle = (label: string) => label.replace(/^M(\d+)$/, "Match $1").replace(/^F(\d+)$/, "Finals $1");

/**
 * The event's playoff bracket and finals matches, laid out like the qualification list:
 * both alliances' teams and, once played, the scores.
 */
function PlayoffSchedule({ playoffs }: { playoffs: PlayoffScheduleMatch[] }) {
  const [watching, setWatching] = useState<PlayoffScheduleMatch | null>(null);
  const showVideos = playoffs.some(hasTbaVideo);
  const groups = [
    { title: "Playoffs", matches: playoffs.filter((match) => !match.isFinal) },
    { title: "Finals", matches: playoffs.filter((match) => match.isFinal) },
  ].filter((group) => group.matches.length > 0);

  // [video] | match | teams | score, each of the last two red over blue on phones and side by side above.
  const columns = showVideos
    ? "grid grid-cols-[1.25rem_2.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[1.25rem_4rem_minmax(0,1fr)_7rem]"
    : "grid grid-cols-[2.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[4rem_minmax(0,1fr)_7rem]";
  const pair = "grid grid-rows-2 gap-0.5 sm:h-full sm:grid-cols-2 sm:grid-rows-1";

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {groups.length === 0 ? (
        <>
          <h2 className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Playoffs</h2>
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">The playoff bracket hasn't been published yet.</p>
        </>
      ) : groups.map((group) => (
        <section key={group.title} className="border-b border-border last:border-b-0">
          {/* Group name in the match column's heading */}
          <div className={`${columns} items-end gap-x-0.5 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-3`}>
            {showVideos && <span />}
            <span className="text-center">{group.title}</span>
            <span className="text-center">Alliances</span>
            <span className="text-center">Score</span>
          </div>
          <ul className="divide-y divide-border">
            {group.matches.map((match) => {
              const isOurs = match.red.includes(OUR_TEAM) || match.blue.includes(OUR_TEAM);
              return (
                <li key={match.key} className="relative">
                  <div
                    className={`${columns} gap-x-1 px-2 py-0.5 sm:h-[25px] sm:gap-x-2 sm:px-3 ${match.status === "current" ? "bg-yellow-500/10" : ""}`}
                  >
                    {showVideos && <span />}
                    <span
                      className={`flex items-center justify-center text-[11px] font-medium ${isOurs ? "font-bold text-primary" : ""}`}
                      title={isOurs ? `${OUR_TEAM} plays in this match` : undefined}
                    >
                      {match.label}
                    </span>
                    <div className={pair}>
                      <ScheduleTeams color="red" teams={match.red} won={match.winner === "red"} rounded="rounded-t-md sm:rounded-none sm:rounded-l-md" />
                      <ScheduleTeams color="blue" teams={match.blue} won={match.winner === "blue"} rounded="rounded-b-md sm:rounded-none sm:rounded-r-md" />
                    </div>
                    <div className={pair}>
                      <ScoreCell color="red" value={match.redScore} won={match.winner === "red"} />
                      <ScoreCell color="blue" value={match.blueScore} won={match.winner === "blue"} />
                    </div>
                  </div>
                  {hasTbaVideo(match) && <VideoButton title={playoffTitle(match.label)} onClick={() => setWatching(match)} />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <MatchVideoDialog
        open={watching !== null}
        onOpenChange={(open) => { if (!open) setWatching(null); }}
        title={watching ? playoffTitle(watching.label) : ""}
        videos={watching?.videos ?? []}
      />
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
 * The selected event's match picker (rendered into `toolbarSlot`, in place of the
 * event dropdown) and, for the chosen qualification match, each alliance's
 * summed averages plus a card per team with its stats and notes from the whole event.
 */
export function MatchDashboard({ event, userId, userName, devMode, toolbarSlot, onMatchOpenChange, canEditVideos }: {
  event: Event | undefined;
  userId: string | undefined;
  userName: string | null;
  devMode: boolean;
  toolbarSlot: HTMLElement | null;
  /** Told whether a match is open, so the page can hide the event dropdown meanwhile. */
  onMatchOpenChange: (open: boolean) => void;
  /** Managers can paste a YouTube link for a match. */
  canEditVideos: boolean;
}) {
  // Tagged with the event it was loaded for, so switching events shows the loading state.
  const [loaded, setLoaded] = useState<{ eventId: string; data: EventData | null; error: string | null } | null>(() => cachedEventLoad(event));
  // The open match lives in the address (?match=12): none means the list of every match
  const [searchParams, setSearchParams] = useSearchParams();
  const matchParam = Number(searchParams.get("match"));
  const [photoTeam, setPhotoTeam] = useState<TeamDashboard | null>(null);
  // Opened from a team's page (its match list or fuel chart): the back button returns there.
  // Switching matches here rewrites the address, which drops this.
  const navigate = useNavigate();
  const fromTeam = (useLocation().state as { fromTeam?: number } | null)?.fromTeam;
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

  const matchOpen = match !== undefined;
  useEffect(() => {
    onMatchOpenChange(matchOpen);
    return () => onMatchOpenChange(false);
  }, [matchOpen, onMatchOpenChange]);

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

  // Toolbar (in place of the event dropdown), only while a match is open: back to the list,
  // and its video when there is one (managers can always open it to paste a link).
  // Matches are picked from the list (or a team card's chips).
  const matchToolbar = toolbarSlot && match && createPortal(
    <div className="flex min-w-0 items-center gap-2">
      {fromTeam ? (
        // Back through history, so the team's page comes back as it was
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Team {fromTeam}
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={showAllMatches}>
          <ArrowLeft className="h-4 w-4" />
          All matches
        </Button>
      )}
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
    body = (
      // Qualifications on the left and alliances over playoffs on the right, half the width each; stacked
      // (600px wide) below lg, where there isn't room side by side. Bottom margin keeps the last rows clear of the floating page nav.
      <div className="mb-20 flex flex-col gap-4 lg:flex-row lg:items-start">
        <MatchSchedule matches={matches} onSelect={selectMatch} />
        <div className="flex w-full max-w-[600px] flex-col gap-4 lg:min-w-0 lg:max-w-none lg:flex-1 lg:basis-0">
          <AllianceSelection alliances={data.schedule.alliances} teamNames={data.schedule.teamNames} />
          <PlayoffSchedule playoffs={data.schedule.playoffs} />
        </div>
      </div>
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
