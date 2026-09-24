import type { Event, Match, GameProfile, Profile, Role } from "@/types";
import { roleColumn } from "./roleUtils";

/**
 * Developer sandbox mode: a fake event + match schedule + infinite-money
 * profile, generated once per user and persisted to localStorage. Nothing
 * in dev mode ever touches Supabase — pages check `isDevModeActive()` (and,
 * for data reads, whether the event/match id belongs to the sandbox) and
 * branch to the functions here instead of their normal Supabase/TBA calls.
 *
 * Scope note: as of this file's introduction, only the Scout Dashboard's
 * match list + live scouting entry/review are wired to the sandbox. The
 * Manager assignment grid, Strategy Dashboard picklist, and pit scouting
 * are not yet — see the "developer mode" work for follow-up.
 */

const ACTIVE_KEY = "dev_mode_active";
const DATA_KEY_PREFIX = "dev_mode_data_"; // + userId, so each dev has their own sandbox

// UUID-shaped (some scouting submission code validates matchId against a
// UUID regex) but built from a recognizable hex prefix so it's easy to
// detect as belonging to the sandbox rather than a real Supabase row.
const DEV_ID_PREFIX = "deadbeef-dead-4dea-adea-";
export const DEV_EVENT_ID = `${DEV_ID_PREFIX}000000000000`;
export const DEV_EVENT_CODE = "devsandbox";

const NUM_QUAL_MATCHES = 125;
const NUM_PLAYOFF_MATCHES = 13;
const NUM_FINALS_MATCHES = 3;
const TOTAL_MATCHES = NUM_QUAL_MATCHES + NUM_PLAYOFF_MATCHES + NUM_FINALS_MATCHES;

// A pool of fake team numbers/nicknames the schedule draws from. Numbered in
// a range (9000s) that will never collide with a real FRC team number.
const TEAM_NICKNAMES = [
  "Iron Wolves", "Circuit Breakers", "Bit Bandits", "Voltage Vipers", "Gear Grinders",
  "Overclocked", "Rogue Robotics", "Sparkplugs", "Nautilus", "Payload",
  "Thunder Drive", "Binary Storm", "Steel Talons", "Quantum Leap", "Rust Belt",
  "Fault Tolerant", "Chain Reaction", "Torque Titans", "Redline", "Byte Force",
  "Copper Comets", "Static Cling", "Watt's Up", "Null Pointer", "Kilobyte Knights",
  "Solder Squad", "Amperage", "Loose Bolts", "Recursion", "Deadlock",
  "Servo Surge", "Panic Wire", "Hex Dump", "Feedback Loop", "Short Circuit",
  "Grid Runners", "Cascade Failure", "Ratchet Set", "Motorhead", "Segfault",
];

interface DevData {
  event: Event;
  matches: Match[];
  matchTeams: Record<number, { red: number[]; blue: number[] }>; // match_number -> team numbers
  teams: Array<{ team_number: number; nickname: string }>;
  gameProfile: GameProfile;
  scoutingSubmissions: Array<{
    id: string;
    match_id: string;
    role: string;
    team_num: number;
    scouting_data: Record<string, unknown>;
    scouter_id: string;
    created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function isDevModeActive(): boolean {
  try {
    return localStorage.getItem(ACTIVE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDevModeActive(active: boolean): void {
  try {
    localStorage.setItem(ACTIVE_KEY, active ? "true" : "false");
  } catch { /* ignore */ }
}

export function isDevEventId(id: string | null | undefined): boolean {
  return id === DEV_EVENT_ID;
}

export function isDevMatchId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEV_ID_PREFIX) && id !== DEV_EVENT_ID;
}

function devMatchId(matchNumber: number): string {
  return `${DEV_ID_PREFIX}${matchNumber.toString(16).padStart(12, "0")}`;
}

export function isDevEventCode(code: string | null | undefined): boolean {
  return code === DEV_EVENT_CODE;
}

// ---------------------------------------------------------------------------
// Data generation
// ---------------------------------------------------------------------------

function randomTeamPool(): Array<{ team_number: number; nickname: string }> {
  return TEAM_NICKNAMES.map((nickname, i) => ({
    team_number: 9001 + i,
    nickname,
  }));
}

function pickAlliance(pool: number[], usedThisMatch: Set<number>): number[] {
  const alliance: number[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (const team of shuffled) {
    if (alliance.length === 3) break;
    if (usedThisMatch.has(team)) continue;
    alliance.push(team);
    usedThisMatch.add(team);
  }
  return alliance;
}

function generateDevData(currentUserId: string): DevData {
  const teams = randomTeamPool();
  const teamNumbers = teams.map((t) => t.team_number);

  const matches: Match[] = [];
  const matchTeams: Record<number, { red: number[]; blue: number[] }> = {};

  for (let i = 1; i <= TOTAL_MATCHES; i++) {
    const usedThisMatch = new Set<number>();
    const red = pickAlliance(teamNumbers, usedThisMatch);
    const blue = pickAlliance(teamNumbers, usedThisMatch);
    matchTeams[i] = { red, blue };

    const match: Match = {
      id: devMatchId(i),
      name: `${DEV_EVENT_CODE.toUpperCase()}-Q${i}`,
      event_id: DEV_EVENT_ID,
      match_number: i,
      red1_scouter_id: null,
      red2_scouter_id: null,
      red3_scouter_id: null,
      qual_red_scouter_id: null,
      blue1_scouter_id: null,
      blue2_scouter_id: null,
      blue3_scouter_id: null,
      qual_blue_scouter_id: null,
      red1_scouter_id_2: null,
      red2_scouter_id_2: null,
      red3_scouter_id_2: null,
      qual_red_scouter_id_2: null,
      blue1_scouter_id_2: null,
      blue2_scouter_id_2: null,
      blue3_scouter_id_2: null,
      qual_blue_scouter_id_2: null,
      winning_alliance: null,
      statbotics_red_win_prob: null,
      match13_red_win_prob: null,
      pred_time: null,
      red_score: null,
      blue_score: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Auto-assign the current dev user to red1 on the first 10 matches, so
    // there's something to scout right away — the Manager assignment grid
    // isn't wired into dev mode yet to do this by hand.
    if (i <= 10) {
      match.red1_scouter_id = currentUserId;
    }

    matches.push(match);
  }

  const event: Event = {
    id: DEV_EVENT_ID,
    name: "Developer Sandbox Event",
    event_code: DEV_EVENT_CODE,
    is_active: false,
    location: "Sandbox",
    start_date: null,
    end_date: null,
    scouting_map_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    users: [],
  };

  const gameProfile: GameProfile = {
    id: `${DEV_EVENT_ID}-profile`,
    user_id: currentUserId,
    points: 999999,
    event_points: 999999,
    unlocked_games: [],
    owned_cosmetics: [],
    equipped_cosmetics: {},
    event_cosmetic_sources: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { event, matches, matchTeams, teams, gameProfile, scoutingSubmissions: [] };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function dataKey(userId: string): string {
  return DATA_KEY_PREFIX + userId;
}

/** Loads (or lazily generates + persists) this user's sandbox dataset. */
export function getDevData(userId: string): DevData {
  try {
    const raw = localStorage.getItem(dataKey(userId));
    if (raw) return JSON.parse(raw) as DevData;
  } catch { /* fall through to regenerate */ }

  const fresh = generateDevData(userId);
  saveDevData(userId, fresh);
  return fresh;
}

function saveDevData(userId: string, data: DevData): void {
  try {
    localStorage.setItem(dataKey(userId), JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

/** Wipes this user's sandbox, generating a brand new event/schedule next time it's read. */
export function resetDevData(userId: string): void {
  try {
    localStorage.removeItem(dataKey(userId));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Reads used by the Scout Dashboard / scouting flow
// ---------------------------------------------------------------------------

export function getDevEvent(userId: string): Event {
  return getDevData(userId).event;
}

export function getDevMatches(userId: string): Match[] {
  return getDevData(userId).matches;
}

export function getDevMatch(userId: string, matchId: string): Match | null {
  return getDevData(userId).matches.find((m) => m.id === matchId) ?? null;
}

/** Team numbers for a match's alliances (stands in for TBA's per-match team_keys). */
export function getDevMatchTeams(userId: string, matchNumber: number): { red: number[]; blue: number[] } | null {
  return getDevData(userId).matchTeams[matchNumber] ?? null;
}

export function getDevMatchTeamForRole(userId: string, matchNumber: number, role: string): number | null {
  const teams = getDevMatchTeams(userId, matchNumber);
  if (!teams) return null;
  const isRed = role.toLowerCase().startsWith("red");
  const positionMatch = role.match(/\d+$/);
  if (!positionMatch) return null;
  const position = parseInt(positionMatch[0], 10) - 1;
  const list = isRed ? teams.red : teams.blue;
  return list[position] ?? null;
}

export function getDevTeams(userId: string): Array<{ team_number: number; nickname: string }> {
  return getDevData(userId).teams;
}

export function getDevGameProfile(userId: string): GameProfile {
  return getDevData(userId).gameProfile;
}

export function hasDevSubmission(userId: string, matchId: string, role: string): boolean {
  return getDevData(userId).scoutingSubmissions.some(
    (s) => s.match_id === matchId && s.role === role && s.scouter_id === userId
  );
}

/** Records a scouting submission into the sandbox only — never reaches Supabase. */
export function submitDevScoutingData(
  userId: string,
  matchId: string,
  role: string,
  teamNum: number,
  scoutingData: Record<string, unknown>
): void {
  const data = getDevData(userId);
  data.scoutingSubmissions.push({
    id: `dev-sub-${matchId}-${role}-${Date.now()}`,
    match_id: matchId,
    role,
    team_num: teamNum,
    scouting_data: scoutingData,
    scouter_id: userId,
    created_at: new Date().toISOString(),
  });
  saveDevData(userId, data);
}

// ---------------------------------------------------------------------------
// Reads/writes used by the Manager Dashboard assignment grid
// ---------------------------------------------------------------------------

/** All submissions recorded in this sandbox (for the manager grid's "completed" checkmarks). */
export function getDevScoutingSubmissions(userId: string) {
  return getDevData(userId).scoutingSubmissions;
}

// Fake ids so these never collide with a real profile row, but are still
// obviously scoped to this one sandbox user (in case of future multi-tab use).
const FAKE_SCOUT_NAMES = ["Alex Scoutwell", "Jamie Trackwell"];

/**
 * A couple of placeholder "other scouts" so the assignment grid can be used
 * to test multi-scout / co-scout assignment without touching real accounts.
 * Not persisted — regenerated fresh (with stable ids) on every call.
 */
export function getDevFakeScouts(): Profile[] {
  return FAKE_SCOUT_NAMES.map((name, i) => ({
    id: `${DEV_ID_PREFIX}f00d0000000${i}`,
    name,
    role: "scout",
    is_manager: false,
    is_developer: false,
    avatar_url: null,
    clocked_in: false,
    clocked_in_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

/**
 * Sets (or clears, with scouterId=null) who's assigned to a role/slot on a
 * sandbox match — mutates the local dataset only, never Supabase.
 */
export function setDevMatchAssignment(
  userId: string,
  matchId: string,
  role: Role,
  slot: 1 | 2,
  scouterId: string | null
): Match | null {
  const data = getDevData(userId);
  const match = data.matches.find((m) => m.id === matchId);
  if (!match) return null;
  const column = roleColumn(role, slot) as keyof Match;
  (match as unknown as Record<string, string | null>)[column] = scouterId;
  saveDevData(userId, data);
  return match;
}
