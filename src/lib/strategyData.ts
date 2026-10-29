import { supabase } from "@/lib/supabase";
import { CURRENT_SCHEMA_VERSION, migrateScoutingData } from "@/lib/scoutingSchema";
import { getDevFakeScouts, getDevMatches, getDevMatchTeams, getDevScoutingSubmissions, getDevTeams } from "@/lib/devMode";
import { getEventAlliances, getEventMatches, getEventTeams } from "@/lib/blueAlliance";
import { parseYouTubeLink, type YouTubeVideo } from "@/lib/youtube";
import { isOutlier, outlierFences } from "@/lib/outliers";
import { AUTO_SHOTS_END } from "@/lib/useMatchTimer";
import type { Event } from "@/types";

// Rows for the Strategy Dashboard's Data tables: quantitative, qualitative and
// pit scouting, each flattened to what its table shows.

export type ScoutingDataType = "quantitative" | "qualitative" | "pit";

export const SCOUTING_DATA_TYPES: Array<{ value: ScoutingDataType; label: string }> = [
  { value: "quantitative", label: "Quantitative" },
  { value: "qualitative", label: "Qualitative" },
  { value: "pit", label: "Pit" },
];

/** One quantitative scouting submission, flattened for the quantitative table. */
export interface QuantRow {
  id: string;
  /** When the scout started the match (falls back to when it was submitted), ISO string. */
  scoutedAt: string;
  scouterName: string | null;
  matchNumber: number | null;
  role: string;
  teamNumber: number | null;
  matchType: string | null;
  autoShots: number;
  teleopShots: number;
  /** TBA tower result for this robot, e.g. "Level1" / "None"; null until fetch-tba-climb-data fills it. */
  autoClimb: string | null;
  endgameClimb: string | null;
  comments: string;
  robotProblems: string;
  errors: string;
  defense: string;
  totalPoints: number;
}

/** One team in a qualitative submission, in the alliance's TBA station order. */
export interface QualTeam {
  teamNumber: number | null;
  /** 1 = ranked best by the scout; null if the team is missing from the ranking. */
  rank: number | null;
  comments: string;
}

/** One qualitative scouting submission (a whole alliance), flattened for the qualitative table. */
export interface QualRow {
  id: string;
  scoutedAt: string;
  scouterName: string | null;
  matchNumber: number | null;
  alliance: "red" | "blue" | null;
  /** Always three entries, best-ranked first; teams missing from the ranking come last, in station order. */
  teams: QualTeam[];
}

/** One pit scouting submission, flattened for the pit table. */
export interface PitRow {
  id: string;
  scoutedAt: string;
  scouterName: string | null;
  teamNumber: number | null;
  dimensions: string;
  weight: string;
  drivetrain: string;
  hopperCapacity: string;
  /** Modular robots only: hopper capacity raised (`hopperCapacity` is lowered). */
  hopperCapacityRaised: string;
  shootingSpeed: string;
  climb: string;
  terrain: string;
  shootingMechanism: string;
  driverExperience: string;
  autoDescription: string;
  photoUrl: string | null;
  notes: string;
}


// 2026 REBUILT point values. Every logged shot counts as one scored FUEL —
// scouts don't record misses or whether the HUB was active.
const POINTS_PER_SHOT = 1;
const AUTO_TOWER_POINTS: Record<number, number> = { 1: 15 };
const ENDGAME_TOWER_POINTS: Record<number, number> = { 1: 10, 2: 20, 3: 30 };

/** Tower level from a TBA value like "Level2"; 0 for "None" or anything unrecognized. */
function towerLevel(value: string | null): number {
  const match = value?.match(/level\s*(\d)/i);
  return match ? Number(match[1]) : 0;
}

/** Free text, or "" when the scout left it empty. Lists (checkbox answers) are joined. */
// Older submissions start robot problems with a category the scout picked ("Lost Connection-...");
// only the description is shown. A category with no description (e.g. "Not Present-") keeps its name.
const ROBOT_PROBLEM_CATEGORY = /^(Lost Connection|Heavy Browning|Something Broke|Not Present)-/;
function robotProblemText(value: unknown): string {
  const raw = text(value);
  const match = raw.match(ROBOT_PROBLEM_CATEGORY);
  if (!match) return raw;
  return raw.slice(match[0].length).trim() || match[1];
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).join(", ");
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The terrain answer as one of the four options in src/config/pitScoutingConfig.ts:
 * Short, Tall, Modular or Stretchy net. When several are checked the most capable wins
 * (modular, then stretchy net, then short). Submissions from the earlier form
 * ("Can go under trench" / "Can go over bump") map to Short if the robot fits under
 * the trench and Tall if it can only go over the bump.
 */
function terrain(value: unknown): string {
  const answers = (Array.isArray(value) ? value : [value])
    .filter((answer): answer is string => typeof answer === "string")
    .map((answer) => answer.trim().toLowerCase());
  const has = (prefix: string) => answers.some((answer) => answer.startsWith(prefix));
  if (has("modular")) return "Modular";
  if (has("have a stretchy net")) return "Stretchy net";
  if (has("short") || has("can go under trench")) return "Short";
  if (has("tall") || has("can go over bump")) return "Tall";
  return "";
}

/** A positive team number, or null. */
function teamNumberOf(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

const isQualRole = (role: string) => role === "qualRed" || role === "qualBlue";

/** Every page of a query, since PostgREST caps each response at 1000 rows. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Profile names for a set of scouter ids. */
async function getScouterNames(ids: Array<string | null | undefined>): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string | null>();
  if (unique.length === 0) return names;
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", unique);
  if (error) throw error;
  (data ?? []).forEach((profile) => names.set(profile.id, profile.name));
  return names;
}

/** Sandbox names: this user plus the sandbox's fake scouts. */
function devScouterNames(userId: string, userName: string | null): Map<string, string | null> {
  return new Map<string, string | null>([
    [userId, userName],
    ...getDevFakeScouts().map((scout): [string, string | null] => [scout.id, scout.name]),
  ]);
}

/** Flattens the `matches!inner(match_number, …)` join into a plain match number. */
function withMatchNumber<T extends { matches?: unknown }>({ matches, ...row }: T): Omit<T, "matches"> & { matchNumber: number | null } {
  return { ...row, matchNumber: (matches as { match_number: number | null } | null)?.match_number ?? null };
}

// ---------------------------------------------------------------------------
// Quantitative
// ---------------------------------------------------------------------------

interface RawQuantSubmission {
  id: string;
  role: string;
  team_num: number | null;
  match_type?: string | null;
  scouting_data: Record<string, unknown> | null;
  schema_version?: number | null;
  scouter_id?: string | null;
  created_at: string;
  tba_data?: { autoClimb?: string; endgameClimb?: string } | null;
  matchNumber: number | null;
}

export function toQuantRow(raw: RawQuantSubmission, names: Map<string, string | null>): QuantRow {
  const version = raw.schema_version ?? CURRENT_SCHEMA_VERSION;
  const data: Record<string, unknown> = version < CURRENT_SCHEMA_VERSION
    ? migrateScoutingData(raw.scouting_data ?? {}, version)
    : raw.scouting_data ?? {};
  const shots = (Array.isArray(data.shots) ? data.shots : []).filter((t: unknown): t is number => typeof t === "number");
  // Auto is the first 23s: auto plus the handoff pause (see AUTO_SHOTS_END)
  const autoShots = shots.filter((t) => t < AUTO_SHOTS_END).length;
  const teleopShots = shots.length - autoShots;

  const autoClimb = raw.tba_data?.autoClimb ?? null;
  const endgameClimb = raw.tba_data?.endgameClimb ?? null;
  const totalPoints = shots.length * POINTS_PER_SHOT
    + (AUTO_TOWER_POINTS[towerLevel(autoClimb)] ?? 0)
    + (ENDGAME_TOWER_POINTS[towerLevel(endgameClimb)] ?? 0);

  return {
    id: raw.id,
    scoutedAt: typeof data.matchStartTime === "number" ? new Date(data.matchStartTime).toISOString() : raw.created_at,
    scouterName: raw.scouter_id ? names.get(raw.scouter_id) ?? null : null,
    matchNumber: raw.matchNumber ?? (typeof data.match_number === "number" ? data.match_number : null),
    role: raw.role,
    teamNumber: teamNumberOf(raw.team_num ?? data.team_number),
    matchType: raw.match_type ?? (typeof data.match_type === "string" ? data.match_type : null),
    autoShots,
    teleopShots,
    autoClimb,
    endgameClimb,
    comments: text(data.comments),
    robotProblems: robotProblemText(data.robot_problems),
    errors: text(data.errors),
    defense: text(data.defenseDescription),
    totalPoints,
  };
}

const ROLE_ORDER = ["red1", "red2", "red3", "blue1", "blue2", "blue3"];

/** Match number, then alliance station, then scout time. */
function compareQuantRows(a: QuantRow, b: QuantRow): number {
  return (a.matchNumber ?? Infinity) - (b.matchNumber ?? Infinity)
    || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
    || a.scoutedAt.localeCompare(b.scoutedAt);
}

/** Every quantitative submission for an event's matches, sorted by match. */
export async function getEventQuantRows(eventId: string): Promise<QuantRow[]> {
  const raws = (await fetchAllPages((from, to) => supabase
    .from("scouting_submissions")
    .select("id, role, team_num, match_type, scouting_data, schema_version, scouter_id, created_at, tba_data, matches!inner(match_number, event_id)")
    .eq("matches.event_id", eventId)
    .order("created_at", { ascending: true })
    .range(from, to)
  )).map((row) => withMatchNumber(row) as RawQuantSubmission);

  const names = await getScouterNames(raws.map((raw) => raw.scouter_id));
  return raws.map((raw) => toQuantRow(raw, names)).sort(compareQuantRows);
}

/** Sandbox stand-in for getEventQuantRows: this user's sandbox submissions for a sandbox event. */
export function getDevEventQuantRows(userId: string, eventId: string, userName: string | null): QuantRow[] {
  const matchNumberById = new Map(getDevMatches(userId, eventId).map((match) => [match.id, match.match_number]));
  const names = devScouterNames(userId, userName);
  // Sandbox qualitative submissions share this list; they have their own table.
  return getDevScoutingSubmissions(userId)
    .filter((submission) => matchNumberById.has(submission.match_id) && !isQualRole(submission.role))
    .map((submission) => toQuantRow({
      ...submission,
      matchNumber: matchNumberById.get(submission.match_id) ?? null,
    }, names))
    .sort(compareQuantRows);
}

// ---------------------------------------------------------------------------
// Qualitative
// ---------------------------------------------------------------------------

interface RawQualSubmission {
  id: string;
  role: string;
  scouting_data: Record<string, unknown> | null;
  scouter_id?: string | null;
  time?: string | null;
  created_at: string;
  matchNumber: number | null;
}

function toQualRow(raw: RawQualSubmission, names: Map<string, string | null>): QualRow {
  const data = raw.scouting_data ?? {};
  // team1-3 are in TBA station order; older submissions only kept teamOptions.
  const fallbackTeams = Object.keys((data.teamOptions as Record<string, unknown> | undefined) ?? {});
  const rankings = (Array.isArray(data.rankings) ? data.rankings : []).map(Number);
  const teams = [1, 2, 3].map((slot): QualTeam => {
    const teamNumber = teamNumberOf(data[`team${slot}`] ?? fallbackTeams[slot - 1]);
    const rankIndex = teamNumber === null ? -1 : rankings.indexOf(teamNumber);
    return {
      teamNumber,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      comments: text(data[`commentsTeam${slot}`]),
    };
  // Each comment travels with its team, so reordering keeps them matched. Sort is
  // stable, so unranked teams keep their station order at the end.
  }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  return {
    id: raw.id,
    scoutedAt: raw.time ?? raw.created_at,
    scouterName: raw.scouter_id ? names.get(raw.scouter_id) ?? null : null,
    matchNumber: raw.matchNumber ?? (typeof data.match_number === "number" ? data.match_number : null),
    alliance: raw.role === "qualRed" ? "red" : raw.role === "qualBlue" ? "blue" : null,
    teams,
  };
}

/** Match number, then red before blue, then scout time. */
function compareQualRows(a: QualRow, b: QualRow): number {
  return (a.matchNumber ?? Infinity) - (b.matchNumber ?? Infinity)
    || (a.alliance === b.alliance ? 0 : a.alliance === "red" ? -1 : 1)
    || a.scoutedAt.localeCompare(b.scoutedAt);
}

/** Every qualitative submission for an event's matches, sorted by match. */
export async function getEventQualRows(eventId: string): Promise<QualRow[]> {
  const raws = (await fetchAllPages((from, to) => supabase
    .from("qual_scouting_submissions")
    .select("id, role, scouting_data, scouter_id, time, created_at, matches!inner(match_number, event_id)")
    .eq("matches.event_id", eventId)
    .order("created_at", { ascending: true })
    .range(from, to)
  )).map((row) => withMatchNumber(row) as RawQualSubmission);

  const names = await getScouterNames(raws.map((raw) => raw.scouter_id));
  return raws.map((raw) => toQualRow(raw, names)).sort(compareQualRows);
}

/** Sandbox stand-in for getEventQualRows: this user's sandbox qualitative submissions. */
export function getDevEventQualRows(userId: string, eventId: string, userName: string | null): QualRow[] {
  const matchNumberById = new Map(getDevMatches(userId, eventId).map((match) => [match.id, match.match_number]));
  const names = devScouterNames(userId, userName);
  return getDevScoutingSubmissions(userId)
    .filter((submission) => matchNumberById.has(submission.match_id) && isQualRole(submission.role))
    .map((submission) => toQualRow({
      ...submission,
      matchNumber: matchNumberById.get(submission.match_id) ?? null,
    }, names))
    .sort(compareQualRows);
}

// ---------------------------------------------------------------------------
// DC (Defensive Capability) ELO, from qualitative rankings
// ---------------------------------------------------------------------------

export const DEFENSE_ELO_START = 1600;
/** A rating gap of this much means the higher-rated team is expected to be ranked above the other 10 times to 1. */
const DEFENSE_ELO_SCALE = 400;
/** The most a rating can move from one pairwise result. */
const DEFENSE_ELO_K = 32;

export interface DefenseElo {
  rating: number;
  /** Qualitative submissions that ranked this team against at least one other. */
  rankings: number;
}

const defenseEloCache = new WeakMap<QualRow[], Map<number, DefenseElo>>();

/**
 * Each ranked team's DC (Defensive Capability) ELO. Every team starts at
 * DEFENSE_ELO_START, and each qualitative submission counts as pairwise results
 * within its alliance (1st beats 2nd and 3rd, 2nd beats 3rd). Submissions are
 * replayed in match order; within one, every result is scored against the
 * ratings from before it, so the order its pairs are taken in doesn't matter.
 */
export function getDefenseElos(qual: QualRow[]): Map<number, DefenseElo> {
  const cached = defenseEloCache.get(qual);
  if (cached) return cached;

  const elos = new Map<number, DefenseElo>();
  const eloOf = (teamNumber: number) => elos.get(teamNumber) ?? { rating: DEFENSE_ELO_START, rankings: 0 };
  [...qual].sort(compareQualRows).forEach((row) => {
    // row.teams is already best-ranked first.
    const ranked = row.teams
      .filter((team) => team.teamNumber !== null && team.rank !== null)
      .map((team) => team.teamNumber!)
      .filter((teamNumber, index, all) => all.indexOf(teamNumber) === index);
    if (ranked.length < 2) return;

    const changes = new Map(ranked.map((teamNumber) => [teamNumber, 0]));
    ranked.forEach((winner, index) => ranked.slice(index + 1).forEach((loser) => {
      const expected = 1 / (1 + 10 ** ((eloOf(loser).rating - eloOf(winner).rating) / DEFENSE_ELO_SCALE));
      const change = DEFENSE_ELO_K * (1 - expected);
      changes.set(winner, changes.get(winner)! + change);
      changes.set(loser, changes.get(loser)! - change);
    }));
    changes.forEach((change, teamNumber) => {
      const elo = eloOf(teamNumber);
      elos.set(teamNumber, { rating: elo.rating + change, rankings: elo.rankings + 1 });
    });
  });

  defenseEloCache.set(qual, elos);
  return elos;
}

/** A team's DC ELO; teams no one has ranked yet sit at the starting rating. */
export const defenseEloOf = (qual: QualRow[], teamNumber: number): DefenseElo =>
  getDefenseElos(qual).get(teamNumber) ?? { rating: DEFENSE_ELO_START, rankings: 0 };

export const formatElo = (rating: number) => String(Math.round(rating));

export const defenseEloDetail = ({ rankings }: DefenseElo) =>
  rankings > 0 ? `${rankings} qualitative ranking${rankings === 1 ? "" : "s"}` : "No rankings yet";

// ---------------------------------------------------------------------------
// Pit
// ---------------------------------------------------------------------------

interface RawPitSubmission {
  id: string;
  team_num: number | null;
  scouter_name: string | null;
  pit_data: Record<string, unknown> | null;
  photo_url: string | null;
  created_at: string;
}

function toPitRow(raw: RawPitSubmission): PitRow {
  // Keys are the question ids in src/config/pitScoutingConfig.ts.
  const data = raw.pit_data ?? {};
  return {
    id: raw.id,
    scoutedAt: raw.created_at,
    scouterName: raw.scouter_name,
    teamNumber: teamNumberOf(raw.team_num),
    dimensions: text(data.dimensions),
    weight: text(data.weight),
    drivetrain: text(data.drivetrain),
    hopperCapacity: text(data["hopper-space"]),
    hopperCapacityRaised: text(data["hopper-space-raised"]),
    shootingSpeed: text(data["shooting-intake-speed"]),
    climb: text(data["climb-levels"]),
    terrain: terrain(data["terrain-capability"]),
    shootingMechanism: text(data["shooting-method"]),
    driverExperience: text(data["driver-competitions"]),
    autoDescription: text(data["auto-paths"]),
    photoUrl: raw.photo_url,
    notes: text(data["additional-notes"]),
  };
}

/** Every pit scouting submission for an event, sorted by team then scout time. */
export async function getEventPitRows(eventId: string): Promise<PitRow[]> {
  const raws = await fetchAllPages<RawPitSubmission>((from, to) => supabase
    .from("pit_scouting_submissions")
    .select("id, team_num, scouter_name, pit_data, photo_url, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .range(from, to)
  );
  return raws.map(toPitRow).sort((a, b) =>
    (a.teamNumber ?? Infinity) - (b.teamNumber ?? Infinity) || a.scoutedAt.localeCompare(b.scoutedAt)
  );
}

// ---------------------------------------------------------------------------
// Match dashboard: one match's six teams, with their stats across the event
// ---------------------------------------------------------------------------

/** Played; about to start or in progress; or not played yet. */
export type MatchStatus = "played" | "current" | "upcoming";

/** A scheduled match's alliances and, once played, its result. */
export interface ScheduledMatch {
  red: number[];
  blue: number[];
  status: MatchStatus;
  /** Final scores once played; null before then (TBA reports -1). */
  redScore: number | null;
  blueScore: number | null;
  /** Null until played. Playoff ties are decided by tiebreakers, so only qualifications can tie. */
  winner: "red" | "blue" | "tie" | null;
  /** Each alliance's score breakdown once played; absent until TBA publishes one. */
  breakdown?: { red: AllianceBreakdown; blue: AllianceBreakdown };
  /** YouTube videos of the match: a manager's pasted link first, then TBA's. */
  videos: MatchVideo[];
}

export interface MatchVideo extends YouTubeVideo {
  /** "link": pasted by a manager (qualifications only, stored on the match row). */
  source: "tba" | "link";
}

/** The parts of an alliance's TBA score breakdown the dashboards show; null when TBA leaves a field out. */
export interface AllianceBreakdown {
  autoFuel: number | null;
  teleopFuel: number | null;
  towerPoints: number | null;
  foulPoints: number | null;
  rankingPoints: number | null;
}

export interface QualScheduleMatch extends ScheduledMatch {
  matchNumber: number;
  /** The YouTube link a manager pasted for the match, as typed; null when none. */
  videoLink?: string | null;
}

export interface PlayoffScheduleMatch extends ScheduledMatch {
  key: string;
  /** Finals matches, as opposed to the bracket rounds before them. */
  isFinal: boolean;
  /** Short name, e.g. "M7" (double-elimination match 7) or "F2" (finals match 2). */
  label: string;
}

/** A playoff alliance from alliance selection. */
export interface PlayoffAlliance {
  /** Seed, 1 first. */
  seed: number;
  /** The captain first, then picks in order. */
  teams: number[];
  /** A backup robot called in, and the pick it replaced. */
  backup: { in: number; out: number } | null;
  /** Null until the alliance plays a playoff match. */
  status: "won" | "eliminated" | "playing" | null;
  /** The last playoff round it reached (where it was knocked out, if it was); null until it plays. */
  round: { name: string; short: string } | null;
}

export interface EventSchedule {
  /** Qualification matches, in order. */
  matches: QualScheduleMatch[];
  /** Playoff alliances in seed order; empty until alliance selection is published. */
  alliances: PlayoffAlliance[];
  /** Playoff matches, in bracket order. */
  playoffs: PlayoffScheduleMatch[];
  teamNames: Map<number, string>;
}

type TBAMatch = NonNullable<Awaited<ReturnType<typeof getEventMatches>>>[number];

const teamNumberFromKey = (key: string) => Number(key.replace(/^frc/, ""));

/** How long before its start time an unplayed match counts as about to start. */
const MATCH_SOON_MS = 10 * 60 * 1000;

/**
 * TBA reports -1 scores until a match is played. An unplayed match is current
 * once TBA has an actual start time for it, or once its predicted (else
 * scheduled) start is less than MATCH_SOON_MS away or already past.
 */
function matchStatus(match: TBAMatch, now: number): MatchStatus {
  if (match.alliances.red.score >= 0 && match.alliances.blue.score >= 0) return "played";
  if (match.actual_time) return "current";
  const start = match.predicted_time ?? match.time;
  return start && start * 1000 - now <= MATCH_SOON_MS ? "current" : "upcoming";
}

type TBAScoreBreakdown = NonNullable<TBAMatch["score_breakdown"]>["red"];

function allianceBreakdown(breakdown: TBAScoreBreakdown): AllianceBreakdown {
  return {
    autoFuel: breakdown.hubScore?.autoCount ?? null,
    teleopFuel: breakdown.hubScore?.teleopCount ?? null,
    towerPoints: breakdown.totalTowerPoints ?? null,
    foulPoints: breakdown.foulPoints ?? null,
    rankingPoints: breakdown.rp ?? null,
  };
}

function scheduledMatch(match: TBAMatch, now: number): ScheduledMatch {
  const status = matchStatus(match, now);
  const redScore = match.alliances.red.score >= 0 ? match.alliances.red.score : null;
  const blueScore = match.alliances.blue.score >= 0 ? match.alliances.blue.score : null;
  let winner: ScheduledMatch["winner"] = null;
  if (status === "played") {
    winner = match.winning_alliance
      || (redScore! > blueScore! ? "red" : blueScore! > redScore! ? "blue" : "tie");
  }
  return {
    red: match.alliances.red.team_keys.map(teamNumberFromKey),
    blue: match.alliances.blue.team_keys.map(teamNumberFromKey),
    status,
    redScore,
    blueScore,
    winner,
    videos: (match.videos ?? [])
      .filter((video) => video.type === "youtube" && video.key)
      // TBA keys can carry a start time ("id?t=90"), so read them like a link.
      .map((video) => parseYouTubeLink(video.key.includes("?") ? `youtu.be/${video.key}` : video.key))
      .filter((video): video is YouTubeVideo => !!video)
      .map((video) => ({ ...video, source: "tba" as const })),
    ...(status === "played" && match.score_breakdown && {
      breakdown: { red: allianceBreakdown(match.score_breakdown.red), blue: allianceBreakdown(match.score_breakdown.blue) },
    }),
  };
}

// Older formats had eighth- and quarterfinals; since 2023 playoffs are
// double-elimination "sf" sets 1-13 (one match each) and then "f" matches.
const PLAYOFF_LEVELS = ["ef", "qf", "sf", "f"];

function playoffLabel(match: TBAMatch): string {
  if (match.comp_level === "f") return `F${match.match_number}`;
  if (match.comp_level === "sf" && match.match_number === 1) return `M${match.set_number}`;
  return `${match.comp_level.toUpperCase()}${match.set_number}-${match.match_number}`;
}

// Rounds of the older bracket formats, by TBA comp level.
const PLAYOFF_ROUNDS: Record<string, { name: string; short: string }> = {
  ef: { name: "Eighthfinals", short: "EF" },
  qf: { name: "Quarterfinals", short: "QF" },
  sf: { name: "Semifinals", short: "SF" },
  f: { name: "Finals", short: "F" },
};

/** An alliance's last playoff round: double elimination's "Round 3" (R3) or "Finals", else the bracket level. */
function playoffRound(doubleElimRound: string | null | undefined, level: string | undefined) {
  if (doubleElimRound) return { name: doubleElimRound, short: doubleElimRound.replace(/^Round /, "R").replace(/^Finals$/, "F") };
  return (level && PLAYOFF_ROUNDS[level]) || null;
}

/** Qualification and playoff schedules and team names for an event, from TBA. */
export async function getEventSchedule(eventCode: string): Promise<EventSchedule> {
  const [tbaMatches, teams, tbaAlliances] = await Promise.all([getEventMatches(eventCode), getEventTeams(eventCode), getEventAlliances(eventCode)]);
  const now = Date.now();
  const matches = (tbaMatches ?? [])
    .filter((match) => match.comp_level === "qm")
    .map((match) => ({ matchNumber: match.match_number, ...scheduledMatch(match, now) }))
    .sort((a, b) => a.matchNumber - b.matchNumber);
  const playoffs = (tbaMatches ?? [])
    .filter((match) => PLAYOFF_LEVELS.includes(match.comp_level))
    .sort((a, b) => PLAYOFF_LEVELS.indexOf(a.comp_level) - PLAYOFF_LEVELS.indexOf(b.comp_level)
      || a.set_number - b.set_number
      || a.match_number - b.match_number)
    .map((match) => ({ key: match.key, isFinal: match.comp_level === "f", label: playoffLabel(match), ...scheduledMatch(match, now) }));
  const alliances = (tbaAlliances ?? []).map((alliance, index): PlayoffAlliance => {
    const status = alliance.status?.status;
    return {
      seed: index + 1,
      teams: alliance.picks.map(teamNumberFromKey),
      backup: alliance.backup ? { in: teamNumberFromKey(alliance.backup.in), out: teamNumberFromKey(alliance.backup.out) } : null,
      status: status === "won" || status === "eliminated" || status === "playing" ? status : null,
      round: playoffRound(alliance.status?.double_elim_round, alliance.status?.level),
    };
  });
  return { matches, alliances, playoffs, teamNames: new Map(teams.map((team) => [team.team_number, team.nickname])) };
}

/** Sandbox stand-in for getEventSchedule. Sandbox matches are never played. */
export function getDevEventSchedule(userId: string, eventId: string): EventSchedule {
  const matches = getDevMatches(userId, eventId)
    .map((match): QualScheduleMatch | null => {
      const teams = getDevMatchTeams(userId, match.match_number, eventId);
      return teams && { matchNumber: match.match_number, red: teams.red, blue: teams.blue, status: "upcoming", redScore: null, blueScore: null, winner: null, videos: [] };
    })
    .filter((match): match is QualScheduleMatch => !!match)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  return { matches, alliances: [], playoffs: [], teamNames: new Map(getDevTeams(userId).map((team) => [team.team_number, team.nickname])) };
}

/** A scout's note about a team, tagged with where it came from. */
export interface TeamNote {
  id: string;
  matchNumber: number | null;
  scouterName: string | null;
  text: string;
  /** Qualitative notes only: where the scout ranked this team within its alliance. */
  rank?: number | null;
}

export interface MeanAndSpread {
  mean: number;
  /** Sample standard deviation; null with fewer than two matches. */
  sd: number | null;
}

export interface MatchFuel {
  matchNumber: number | null;
  auto: number;
  teleop: number;
  autoSuspicious: boolean;
  teleopSuspicious: boolean;
}

export interface TeamDashboard {
  teamNumber: number;
  name: string | null;
  photoUrl: string | null;
  /**
   * The qualification matches everything below is limited to, newest first,
   * when built for the team's last few matches; null when it covers the whole event.
   * Pit data, DC ELO and `allMatchFuel` / `qualMatches` always cover the whole event.
   */
  recentMatches: number[] | null;
  /** Distinct matches with quantitative scouting. */
  matchesScouted: number;
  /**
   * Fuel per scouted match (co-scouted matches averaged), in match order. A match is
   * suspicious when one of its entries is outside the team's usual range (see outliers.ts).
   */
  matchFuel: MatchFuel[];
  /** `matchFuel` for every scouted match, ignoring `recentMatches`. */
  allMatchFuel: MatchFuel[];
  autoFuel: MeanAndSpread | null;
  teleopFuel: MeanAndSpread | null;
  /** Fuel plus TBA-reported tower points, per match. */
  totalPoints: MeanAndSpread | null;
  shooterType: string;
  terrain: string;
  /** The pit scout's weight answer (with bumpers), pounds added when it's just a number. */
  weight: string;
  /** The pit scout's hopper capacity and shooting speed answers, as typed. */
  hopperCapacity: string;
  /** Modular robots only: the hopper capacity raised, from the same submission as `hopperCapacity`. */
  hopperCapacityRaised: string;
  shootingSpeed: string;
  /** Mean endgame tower level (0 = no climb … 3), over matches TBA has reported. */
  averageClimb: number | null;
  climbMatches: number;
  /** Share of quantitative submissions that noted robot problems. */
  errorRate: { problems: number; submissions: number } | null;
  defenseElo: DefenseElo;
  comments: TeamNote[];
  robotProblems: TeamNote[];
  defense: TeamNote[];
  qualComments: TeamNote[];
  qualMatches: Array<{ matchNumber: number; alliance: "red" | "blue"; status: MatchStatus }>;
}

function meanAndSpread(values: number[]): MeanAndSpread | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, sd: null };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

const byMatch = (a: TeamNote, b: TeamNote) => (a.matchNumber ?? Infinity) - (b.matchNumber ?? Infinity);

/** "125" → "125 lb"; anything else (e.g. "125 lbs") is shown as the scout typed it. */
function weightLabel(value: string | null): string {
  const text = value?.trim() ?? "";
  return /^\d+(\.\d+)?$/.test(text) ? `${text} lb` : text;
}

/** How many of a team's latest matches the team page's "last matches" filter keeps. */
export const RECENT_MATCH_COUNT = 4;

/**
 * A team's last `count` scouted matches (matches with quantitative scouting
 * of the team), newest first, regardless of what the schedule says it played.
 */
export function recentQualMatches(teamNumber: number, data: { quant: QuantRow[] }, count: number): number[] {
  const scouted = new Set<number>();
  data.quant.forEach((row) => {
    if (row.teamNumber === teamNumber && row.matchNumber != null) scouted.add(row.matchNumber);
  });
  return [...scouted].sort((a, b) => b - a).slice(0, count);
}

/**
 * Everything the match dashboard shows for one team, from the event's scouting data.
 * With `lastMatches`, the stats, fuel and notes only use the team's last that many
 * scouted matches (see recentQualMatches).
 */
export function buildTeamDashboard(
  teamNumber: number,
  data: { quant: QuantRow[]; qual: QualRow[]; pit: PitRow[]; schedule: EventSchedule },
  { lastMatches }: { lastMatches?: number } = {}
): TeamDashboard {
  const recentMatches = lastMatches ? recentQualMatches(teamNumber, data, lastMatches) : null;
  const inWindow = (matchNumber: number | null) => !recentMatches || (matchNumber != null && recentMatches.includes(matchNumber));
  const allQuant = data.quant.filter((row) => row.teamNumber === teamNumber);
  const quant = allQuant.filter((row) => inWindow(row.matchNumber));

  // Suspicious entries, flagged against all of the team's submissions at the event, the same
  // way the data table does
  const autoFences = outlierFences(allQuant.map((row) => row.autoShots));
  const teleopFences = outlierFences(allQuant.map((row) => row.teleopShots));

  // Co-scouted matches have two submissions; average each match first so they
  // don't count twice toward the event averages.
  const perMatch = new Map<number | string, QuantRow[]>();
  allQuant.forEach((row) => {
    const key = row.matchNumber ?? row.id;
    perMatch.set(key, [...(perMatch.get(key) ?? []), row]);
  });
  const allMatchAverages = [...perMatch.values()].map((rows) => ({
    matchNumber: rows[0].matchNumber,
    auto: rows.reduce((sum, row) => sum + row.autoShots, 0) / rows.length,
    teleop: rows.reduce((sum, row) => sum + row.teleopShots, 0) / rows.length,
    autoSuspicious: rows.some((row) => isOutlier(row.autoShots, autoFences)),
    teleopSuspicious: rows.some((row) => isOutlier(row.teleopShots, teleopFences)),
    points: rows.reduce((sum, row) => sum + row.totalPoints, 0) / rows.length,
    // TBA reports the same climb for every submission in a match; take the first known one.
    climb: rows.find((row) => row.endgameClimb && !/unknown/i.test(row.endgameClimb))?.endgameClimb ?? null,
  }));
  const matchAverages = allMatchAverages.filter((match) => inWindow(match.matchNumber));
  const fuelByMatch = (matches: typeof allMatchAverages) => matches
    .map(({ matchNumber, auto, teleop, autoSuspicious, teleopSuspicious }) => ({ matchNumber, auto, teleop, autoSuspicious, teleopSuspicious }))
    .sort((a, b) => (a.matchNumber ?? Infinity) - (b.matchNumber ?? Infinity));
  const climbLevels = matchAverages
    .filter((match) => match.climb !== null)
    .map((match) => towerLevel(match.climb));

  // Latest pit submission wins, field by field (an older one may have a photo the newer lacks).
  const pit = data.pit
    .filter((row) => row.teamNumber === teamNumber)
    .sort((a, b) => b.scoutedAt.localeCompare(a.scoutedAt));
  const latestPit = <K extends keyof PitRow>(key: K) => pit.find((row) => row[key])?.[key] ?? null;
  // Both hopper answers from one submission, so a modular robot's raised capacity never pairs
  // with a later submission's (non-modular) one
  const hopperPit = pit.find((row) => row.hopperCapacity);

  const notes = (pick: (row: QuantRow) => string) => quant
    .filter((row) => pick(row))
    .map((row) => ({ id: row.id, matchNumber: row.matchNumber, scouterName: row.scouterName, text: pick(row) }))
    .sort(byMatch);

  const qualComments = data.qual.filter((row) => inWindow(row.matchNumber)).flatMap((row) => row.teams
    .filter((team) => team.teamNumber === teamNumber && team.comments)
    .map((team) => ({ id: row.id, matchNumber: row.matchNumber, scouterName: row.scouterName, text: team.comments, rank: team.rank }))
  ).sort(byMatch);

  return {
    teamNumber,
    name: data.schedule.teamNames.get(teamNumber) ?? null,
    photoUrl: latestPit("photoUrl"),
    recentMatches,
    matchesScouted: matchAverages.length,
    matchFuel: fuelByMatch(matchAverages),
    allMatchFuel: fuelByMatch(allMatchAverages),
    autoFuel: meanAndSpread(matchAverages.map((match) => match.auto)),
    teleopFuel: meanAndSpread(matchAverages.map((match) => match.teleop)),
    totalPoints: meanAndSpread(matchAverages.map((match) => match.points)),
    shooterType: latestPit("shootingMechanism") ?? "",
    terrain: latestPit("terrain") ?? "",
    weight: weightLabel(latestPit("weight")),
    hopperCapacity: hopperPit?.hopperCapacity ?? "",
    hopperCapacityRaised: hopperPit?.hopperCapacityRaised ?? "",
    shootingSpeed: latestPit("shootingSpeed") ?? "",
    averageClimb: climbLevels.length > 0 ? climbLevels.reduce((sum, level) => sum + level, 0) / climbLevels.length : null,
    climbMatches: climbLevels.length,
    errorRate: quant.length > 0 ? { problems: quant.filter((row) => row.robotProblems).length, submissions: quant.length } : null,
    defenseElo: defenseEloOf(data.qual, teamNumber),
    comments: notes((row) => row.comments),
    robotProblems: notes((row) => row.robotProblems),
    defense: notes((row) => row.defense),
    qualComments,
    qualMatches: data.schedule.matches
      .filter((match) => match.red.includes(teamNumber) || match.blue.includes(teamNumber))
      .map((match) => ({ matchNumber: match.matchNumber, alliance: match.red.includes(teamNumber) ? "red" : "blue", status: match.status })),
  };
}

export const ORDINALS = ["1st", "2nd", "3rd"];

export const formatNumber = (value: number) => value.toFixed(1);

/** Everything buildTeamDashboard needs for one event. */
export interface EventData {
  schedule: EventSchedule;
  quant: QuantRow[];
  qual: QualRow[];
  pit: PitRow[];
}

/** How long a load is reused before the next request refetches it. */
const EVENT_DATA_FRESH_MS = 30 * 1000;

/**
 * Each event's latest load (sandbox loads are local, so never cached), shared by the
 * match dashboard, Teams page and team popup: moving between them reuses it instead
 * of refetching, and `data` keeps the last result on screen while a newer load runs.
 */
const eventDataCache = new Map<string, { loading: Promise<EventData>; startedAt: number; data: EventData | null }>();

/**
 * The event's last loaded data, tagged with its event like the views' load state,
 * so a view can start from it instead of a loading spinner while loadEventData refreshes it.
 */
export function cachedEventLoad(event: Event | undefined): { eventId: string; data: EventData; error: null } | null {
  const data = event ? eventDataCache.get(event.id)?.data : null;
  return event && data ? { eventId: event.id, data, error: null } : null;
}

/** Loads an event's schedule and scouting data; `sandbox` reads the dev-mode local store instead. */
export async function loadEventData(event: Event, sandbox: { userId: string; userName: string | null } | null): Promise<EventData> {
  if (sandbox) {
    return {
      schedule: getDevEventSchedule(sandbox.userId, event.id),
      quant: getDevEventQuantRows(sandbox.userId, event.id, sandbox.userName),
      qual: getDevEventQualRows(sandbox.userId, event.id, sandbox.userName),
      // The sandbox has no local pit scouting store.
      pit: [],
    };
  }
  if (!event.event_code) throw new Error("This event has no TBA event code, so its match schedule can't be loaded.");

  // A recent or in-flight load is shared rather than repeated.
  const cached = eventDataCache.get(event.id);
  if (cached && Date.now() - cached.startedAt < EVENT_DATA_FRESH_MS) return cached.loading;

  const eventCode = event.event_code;
  const loading = Promise.all([
    getEventSchedule(eventCode),
    getEventVideoLinks(event.id),
    getEventQuantRows(event.id),
    getEventQualRows(event.id),
    getEventPitRows(event.id),
  ]).then(([schedule, videoLinks, quant, qual, pit]) => ({
    schedule: {
      ...schedule,
      matches: schedule.matches.map((match) => withVideoLink(match, videoLinks.get(match.matchNumber) ?? null)),
    },
    quant,
    qual,
    pit,
  }));
  const entry = { loading, startedAt: Date.now(), data: cached?.data ?? null };
  eventDataCache.set(event.id, entry);
  loading.then(
    (data) => { entry.data = data; },
    // A failed load is retried on the next request; the last good data stays cached.
    () => { entry.startedAt = 0; }
  );
  return loading;
}

/** Managers' pasted video links for the event's matches, by match number. */
async function getEventVideoLinks(eventId: string): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from("matches")
    .select("match_number, video_url")
    .eq("event_id", eventId)
    .not("video_url", "is", null);
  // Pasted links are extras: without them (e.g. before the video_url migration) the schedule still loads.
  if (error) {
    console.warn("Could not load match video links:", error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.match_number as number, row.video_url as string]));
}

/** The match with `link` (when it's a YouTube link) ahead of TBA's videos. */
function withVideoLink(match: QualScheduleMatch, link: string | null): QualScheduleMatch {
  const pasted = link ? parseYouTubeLink(link) : null;
  return {
    ...match,
    videoLink: link,
    videos: [...(pasted ? [{ ...pasted, source: "link" as const }] : []), ...match.videos.filter((video) => video.source === "tba")],
  };
}

/**
 * Saves (or, with null, removes) a manager's YouTube link for a qualification match and
 * returns the event's data with it applied, for the view to show straight away.
 */
export async function setMatchVideoLink(event: Event, data: EventData, matchNumber: number, link: string | null): Promise<EventData> {
  const { data: rows, error } = await supabase
    .from("matches")
    .update({ video_url: link })
    .eq("event_id", event.id)
    .eq("match_number", matchNumber)
    .select("id");
  if (error) throw new Error(error.message);
  // No row: the match isn't in the database, or row security kept this user from changing it.
  if (!rows?.length) throw new Error(`Quals ${matchNumber} couldn't be updated. Only managers can add match videos.`);

  const updated: EventData = {
    ...data,
    schedule: {
      ...data.schedule,
      matches: data.schedule.matches.map((match) => match.matchNumber === matchNumber ? withVideoLink(match, link) : match),
    },
  };
  // Other views pick up the change, and their next load refetches rather than reusing an older one.
  const cached = eventDataCache.get(event.id);
  if (cached) {
    cached.data = updated;
    cached.startedAt = 0;
  }
  return updated;
}
