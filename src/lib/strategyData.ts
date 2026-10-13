import { supabase } from "@/lib/supabase";
import { CURRENT_SCHEMA_VERSION, migrateScoutingData } from "@/lib/scoutingSchema";
import { getDevFakeScouts, getDevMatches, getDevScoutingSubmissions } from "@/lib/devMode";

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
  /** Always three entries: team 1, 2 and 3. */
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
  shootingSpeed: string;
  climb: string;
  terrain: string;
  shootingMechanism: string;
  driverExperience: string;
  autoDescription: string;
  photoUrl: string | null;
  notes: string;
}

// Shots are stored as seconds since the scout pressed start; auto is the first
// 20s (see AUTO_END_TIME in useMatchTimer.ts).
const AUTO_END_SECONDS = 20;

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
function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.trim()).join(", ");
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value.trim() : "";
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

function toQuantRow(raw: RawQuantSubmission, names: Map<string, string | null>): QuantRow {
  const version = raw.schema_version ?? CURRENT_SCHEMA_VERSION;
  const data: Record<string, unknown> = version < CURRENT_SCHEMA_VERSION
    ? migrateScoutingData(raw.scouting_data ?? {}, version)
    : raw.scouting_data ?? {};
  const shots = (Array.isArray(data.shots) ? data.shots : []).filter((t: unknown): t is number => typeof t === "number");
  const autoShots = shots.filter((t) => t < AUTO_END_SECONDS).length;
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
    robotProblems: text(data.robot_problems),
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
  });

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
    shootingSpeed: text(data["shooting-intake-speed"]),
    climb: text(data["climb-levels"]),
    terrain: text(data["terrain-capability"]),
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
