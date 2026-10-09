import type { Event, Match, GameProfile, Profile, Role, Roster } from "@/types";
import type { Bet, BetAlliance, BetCurrency, BetWithMatch } from "@/types/betting";
import { ROLE_TO_COLUMN, ROLE_TO_COLUMN_2, roleColumn } from "./roleUtils";

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

// Fake teams used by the sandbox schedule and strategy picklist.
const TEAM_NICKNAMES = [
  "Iron Wolves", "Circuit Breakers", "Bit Bandits", "Voltage Vipers", "Gear Grinders",
  "Overclocked", "Rogue Robotics", "Sparkplugs", "Nautilus", "Payload",
  "Thunder Drive", "Binary Storm", "Steel Talons", "Quantum Leap", "Rust Belt",
  "Fault Tolerant", "Chain Reaction", "Torque Titans", "Redline", "Byte Force",
];

export interface DevFrcdleSpin {
  spin_day: string;
  spin_number: string;
  created_at: string;
}

interface DevData {
  event: Event;
  matches: Match[];
  matchTeams: Record<number, { red: number[]; blue: number[] }>; // match_number -> team numbers
  additionalEvents?: Event[];
  additionalMatches?: Record<string, Match[]>;
  additionalMatchTeams?: Record<string, Record<number, { red: number[]; blue: number[] }>>;
  sandboxRosters?: Record<string, Roster[]>;
  sandboxPicklists?: Record<string, { picked_team_numbers: number[]; do_not_pick_team_numbers: number[] }>;
  sandboxBets?: Bet[];
  /** FRCdle daily rolls made in the sandbox, kept apart from the account's real rolls. */
  sandboxFrcdleSpins?: DevFrcdleSpin[];
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
  return id === DEV_EVENT_ID || (!!id && /^deadbeef-dead-4dea-adea-e[0-9a-f]{11}$/.test(id));
}

export function isDevMatchId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(DEV_ID_PREFIX) && !isDevEventId(id);
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
    team_number: 9980 + i,
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

function createAllianceTeams(teamNumbers: number[]): { red: number[]; blue: number[] } {
  const usedThisMatch = new Set<number>();
  return {
    red: pickAlliance(teamNumbers, usedThisMatch),
    blue: pickAlliance(teamNumbers, usedThisMatch),
  };
}

// Red's predicted win chance, anywhere from a sure loss/win (0% / 100%) to a coin flip.
function randomWinProbability(): number {
  return Math.round(Math.random() * 1000) / 1000;
}

function createDevMatch(
  matchNumber: number,
  currentUserId: string,
  teamNumbers: number[],
  eventId = DEV_EVENT_ID,
  eventCode = DEV_EVENT_CODE,
  eventIndex = 0
): { match: Match; teams: { red: number[]; blue: number[] } } {
  const allianceTeams = createAllianceTeams(teamNumbers);

  const match: Match = {
    id: eventId === DEV_EVENT_ID
      ? devMatchId(matchNumber)
      : `${DEV_ID_PREFIX}${eventIndex.toString(16).padStart(6, "0")}${matchNumber.toString(16).padStart(6, "0")}`,
    name: `${eventCode.toUpperCase()}-Q${matchNumber}`,
    event_id: eventId,
    match_number: matchNumber,
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
    match13_red_win_prob: randomWinProbability(),
    pred_time: null,
    red_score: null,
    blue_score: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (matchNumber <= 10) match.red1_scouter_id = currentUserId;
  return { match, teams: allianceTeams };
}

function generateDevData(currentUserId: string): DevData {
  const teams = randomTeamPool();
  const teamNumbers = teams.map((t) => t.team_number);

  const matches: Match[] = [];
  const matchTeams: Record<number, { red: number[]; blue: number[] }> = {};

  for (let i = 1; i <= TOTAL_MATCHES; i++) {
    const generated = createDevMatch(i, currentUserId, teamNumbers);
    matches.push(generated.match);
    matchTeams[i] = generated.teams;
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

function refreshSandboxTeamPool(data: DevData): boolean {
  const teams = randomTeamPool();
  const currentTeams = data.teams ?? [];
  const isCurrentPool = currentTeams.length === teams.length && teams.every(
    (team, index) => team.team_number === currentTeams[index]?.team_number && team.nickname === currentTeams[index]?.nickname
  );
  const schedules = [data.matches, ...Object.values(data.additionalMatches ?? {})];
  const matchesNeedOdds = schedules.some((schedule) => schedule.some((match) => match.match13_red_win_prob == null));
  if (isCurrentPool && !matchesNeedOdds) return false;

  const teamNumbers = teams.map((team) => team.team_number);
  if (!isCurrentPool) for (const picklist of Object.values(data.sandboxPicklists ?? {})) {
    const migrateTeamNumbers = (values: number[]) => [...new Set(values.map((teamNumber) =>
      teamNumber >= 9001 && teamNumber <= 9039
        ? teamNumbers[(teamNumber - 9001) % teamNumbers.length]
        : teamNumber
    ))];
    picklist.picked_team_numbers = migrateTeamNumbers(picklist.picked_team_numbers);
    const picked = new Set(picklist.picked_team_numbers);
    picklist.do_not_pick_team_numbers = migrateTeamNumbers(picklist.do_not_pick_team_numbers)
      .filter((teamNumber) => !picked.has(teamNumber));
  }

  const allianceTeamsByMatch = new Map<string, { red: number[]; blue: number[] }>();

  for (let scheduleIndex = 0; scheduleIndex < schedules.length; scheduleIndex++) {
    const schedule = schedules[scheduleIndex];
    const isDefaultSchedule = scheduleIndex === 0;
    const eventId = isDefaultSchedule ? DEV_EVENT_ID : schedule[0]?.event_id;
    if (!eventId) continue;
    const scheduleTeamMap = isDefaultSchedule
      ? data.matchTeams
      : ((data.additionalMatchTeams ??= {})[eventId] ??= {});

    for (const match of schedule) {
      if (!isCurrentPool || !scheduleTeamMap[match.match_number]) {
        scheduleTeamMap[match.match_number] = createAllianceTeams(teamNumbers);
      }
      if (match.match13_red_win_prob == null) match.match13_red_win_prob = randomWinProbability();
      allianceTeamsByMatch.set(match.id, scheduleTeamMap[match.match_number]);
    }
  }

  if (!isCurrentPool) for (const submission of data.scoutingSubmissions ?? []) {
    const allianceTeams = allianceTeamsByMatch.get(submission.match_id);
    if (!allianceTeams) continue;
    const roleMatch = submission.role.match(/^(red|blue)([1-3])$/i);
    const role = submission.role.toLowerCase();
    const alliance = role.startsWith("blue") || role === "qualblue"
      ? allianceTeams.blue
      : allianceTeams.red;
    if (roleMatch) {
      submission.team_num = alliance[Number(roleMatch[2]) - 1];
    } else if (role === "qualred" || role === "qualblue") {
      submission.team_num = alliance[0];
    } else if (submission.team_num >= 9001 && submission.team_num <= 9039) {
      submission.team_num = teamNumbers[(submission.team_num - 9001) % teamNumbers.length];
    }
  }

  if (!isCurrentPool) data.teams = teams;
  return true;
}

/** Loads (or lazily generates + persists) this user's sandbox dataset. */
export function getDevData(userId: string): DevData {
  try {
    const raw = localStorage.getItem(dataKey(userId));
    if (raw) {
      const data = JSON.parse(raw) as DevData;
      if (refreshSandboxTeamPool(data)) saveDevData(userId, data);
      return data;
    }
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
// FRCdle (sandbox stand-in for the frcdle-spin edge function)
// ---------------------------------------------------------------------------

export function getDevFrcdleSpins(userId: string): DevFrcdleSpin[] {
  return getDevData(userId).sandboxFrcdleSpins ?? [];
}

/** The sandbox roll for `spinDay`, creating one when `create` is set and none exists. */
export function getOrCreateDevFrcdleSpin(userId: string, spinDay: string, create: boolean): DevFrcdleSpin | null {
  const data = getDevData(userId);
  const spins = data.sandboxFrcdleSpins ?? [];
  const existing = spins.find((spin) => spin.spin_day === spinDay);
  if (existing || !create) return existing ?? null;
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  const spin: DevFrcdleSpin = {
    spin_day: spinDay,
    spin_number: String(value[0] % 1_000_000).padStart(6, "0"),
    created_at: new Date().toISOString(),
  };
  data.sandboxFrcdleSpins = [...spins, spin];
  saveDevData(userId, data);
  return spin;
}

// ---------------------------------------------------------------------------
// Reads used by the Scout Dashboard / scouting flow
// ---------------------------------------------------------------------------

export function getDevEvent(userId: string, eventId?: string): Event {
  const data = getDevData(userId);
  const events = [data.event, ...(data.additionalEvents ?? [])];
  if (eventId) return events.find((event) => event.id === eventId) ?? data.event;
  return events.find((event) => event.is_active) ?? data.event;
}

export function getDevEvents(userId: string): Event[] {
  const data = getDevData(userId);
  return [data.event, ...(data.additionalEvents ?? [])];
}

export function getDevMatches(userId: string, eventId?: string): Match[] {
  const data = getDevData(userId);
  const resolvedEventId = eventId ?? data.additionalEvents?.find((event) => event.is_active)?.id ?? DEV_EVENT_ID;
  return resolvedEventId === DEV_EVENT_ID ? data.matches : data.additionalMatches?.[resolvedEventId] ?? [];
}

export function getAllDevMatches(userId: string): Match[] {
  const data = getDevData(userId);
  return [
    ...data.matches,
    ...Object.values(data.additionalMatches ?? {}).flat(),
  ];
}

export function createDevEvent(
  userId: string,
  name: string,
  eventCode: string,
  matchCount: number
): Event {
  const data = getDevData(userId);
  const maxIndex = (data.additionalEvents ?? []).reduce((max, event) => {
    const index = Number.parseInt(event.id.slice(-11), 16);
    return Number.isFinite(index) ? Math.max(max, index) : max;
  }, 0);
  const eventIndex = maxIndex + 1;
  const id = `${DEV_ID_PREFIX}e${eventIndex.toString(16).padStart(11, "0")}`;
  const now = new Date().toISOString();
  const event: Event = {
    id,
    name,
    event_code: eventCode,
    is_active: false,
    location: null,
    start_date: null,
    end_date: null,
    scouting_map_url: null,
    created_at: now,
    updated_at: now,
    users: [],
  };
  const teamNumbers = data.teams.map((team) => team.team_number);
  const matches: Match[] = [];
  const matchTeams: Record<number, { red: number[]; blue: number[] }> = {};
  for (let matchNumber = 1; matchNumber <= matchCount; matchNumber++) {
    const generated = createDevMatch(matchNumber, userId, teamNumbers, id, eventCode, eventIndex);
    matches.push(generated.match);
    matchTeams[matchNumber] = generated.teams;
  }
  data.additionalEvents = [...(data.additionalEvents ?? []), event];
  data.additionalMatches = { ...(data.additionalMatches ?? {}), [id]: matches };
  data.additionalMatchTeams = { ...(data.additionalMatchTeams ?? {}), [id]: matchTeams };
  saveDevData(userId, data);
  return event;
}

export function updateDevEvent(
  userId: string,
  eventId: string,
  updates: Partial<Pick<Event, "name" | "event_code" | "location" | "start_date" | "end_date" | "scouting_map_url" | "users">>
): boolean {
  const data = getDevData(userId);
  const event = [data.event, ...(data.additionalEvents ?? [])].find((item) => item.id === eventId);
  if (!event) return false;
  Object.assign(event, updates, { updated_at: new Date().toISOString() });
  saveDevData(userId, data);
  return true;
}

export function setDevActiveEvent(userId: string, eventId: string): boolean {
  const data = getDevData(userId);
  const events = [data.event, ...(data.additionalEvents ?? [])];
  const event = events.find((item) => item.id === eventId);
  if (!event) return false;
  for (const sandboxEvent of events) {
    sandboxEvent.is_active = sandboxEvent.id === eventId;
  }
  saveDevData(userId, data);
  return true;
}

export function deleteDevEvent(userId: string, eventId: string): boolean {
  if (eventId === DEV_EVENT_ID) return false;
  const data = getDevData(userId);
  const existingEvents = data.additionalEvents ?? [];
  if (!existingEvents.some((event) => event.id === eventId)) return false;
  data.additionalEvents = existingEvents.filter((event) => event.id !== eventId);
  delete data.additionalMatches?.[eventId];
  delete data.additionalMatchTeams?.[eventId];
  const remainingMatchIds = new Set([
    ...data.matches,
    ...Object.values(data.additionalMatches ?? {}).flat(),
  ].map((match) => match.id));
  data.scoutingSubmissions = data.scoutingSubmissions.filter((submission) => remainingMatchIds.has(submission.match_id));
  saveDevData(userId, data);
  return true;
}

/** Resizes the sandbox schedule locally and returns the number of matches added or removed. */
export function setDevMatchCount(userId: string, targetCount: number, eventId = DEV_EVENT_ID): number {
  const data = getDevData(userId);
  const matches = eventId === DEV_EVENT_ID ? data.matches : data.additionalMatches?.[eventId];
  if (!matches) return 0;
  const difference = targetCount - matches.length;
  if (difference === 0) return 0;

  if (difference < 0) {
    if (eventId === DEV_EVENT_ID) data.matches = matches.slice(0, targetCount);
    else data.additionalMatches![eventId] = matches.slice(0, targetCount);
    const remainingMatchIds = new Set([
      ...data.matches,
      ...Object.values(data.additionalMatches ?? {}).flat(),
    ].map((match) => match.id));
    data.scoutingSubmissions = data.scoutingSubmissions.filter((submission) =>
      remainingMatchIds.has(submission.match_id)
    );
    const matchTeams = eventId === DEV_EVENT_ID ? data.matchTeams : data.additionalMatchTeams?.[eventId];
    for (const matchNumber of Object.keys(matchTeams ?? {})) {
      if (Number(matchNumber) > targetCount) delete matchTeams![Number(matchNumber)];
    }
  } else {
    const teamNumbers = data.teams.map((team) => team.team_number);
    const event = [data.event, ...(data.additionalEvents ?? [])].find((item) => item.id === eventId);
    if (!event) return 0;
    const eventIndex = eventId === DEV_EVENT_ID ? 0 : Number.parseInt(eventId.slice(-11), 16);
    const matchTeams = eventId === DEV_EVENT_ID
      ? data.matchTeams
      : (data.additionalMatchTeams ??= {})[eventId] ??= {};
    for (let matchNumber = matches.length + 1; matchNumber <= targetCount; matchNumber++) {
      const generated = createDevMatch(matchNumber, userId, teamNumbers, eventId, event.event_code || DEV_EVENT_CODE, eventIndex);
      matches.push(generated.match);
      matchTeams[matchNumber] = generated.teams;
    }
  }

  saveDevData(userId, data);
  return difference;
}

export function getDevMatch(userId: string, matchId: string): Match | null {
  return getAllDevMatches(userId).find((m) => m.id === matchId) ?? null;
}

export function setDevMatchResult(
  userId: string,
  matchId: string,
  winner: "red" | "blue" | "tie"
): Match | null {
  const data = getDevData(userId);
  const match = [data.matches, ...Object.values(data.additionalMatches ?? {})]
    .flat()
    .find((item) => item.id === matchId);
  if (!match) return null;
  match.winning_alliance = winner;
  if (winner === "tie") {
    const score = 80 + Math.floor(Math.random() * 141);
    match.red_score = score;
    match.blue_score = score;
  } else {
    const winningScore = 100 + Math.floor(Math.random() * 121);
    const losingScore = Math.floor(Math.random() * winningScore);
    match.red_score = winner === "red" ? winningScore : losingScore;
    match.blue_score = winner === "blue" ? winningScore : losingScore;
  }
  match.updated_at = new Date().toISOString();
  saveDevData(userId, data);
  return match;
}

/** Team numbers for a match's alliances (stands in for TBA's per-match team_keys). */
export function getDevMatchTeams(userId: string, matchNumber: number, eventId?: string): { red: number[]; blue: number[] } | null {
  const data = getDevData(userId);
  const resolvedEventId = eventId ?? data.additionalEvents?.find((event) => event.is_active)?.id ?? DEV_EVENT_ID;
  return resolvedEventId === DEV_EVENT_ID
    ? data.matchTeams[matchNumber] ?? null
    : data.additionalMatchTeams?.[resolvedEventId]?.[matchNumber] ?? null;
}

export function getDevMatchTeamForRole(userId: string, matchNumber: number, role: string, eventId?: string): number | null {
  const teams = getDevMatchTeams(userId, matchNumber, eventId);
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

export function getDevPicklist(
  userId: string,
  eventId: string
): { picked_team_numbers: number[]; do_not_pick_team_numbers: number[] } | null {
  return getDevData(userId).sandboxPicklists?.[eventId] ?? null;
}

export function saveDevPicklist(
  userId: string,
  eventId: string,
  pickedTeamNumbers: number[],
  doNotPickTeamNumbers: number[]
): void {
  const data = getDevData(userId);
  data.sandboxPicklists = {
    ...(data.sandboxPicklists ?? {}),
    [eventId]: {
      picked_team_numbers: pickedTeamNumbers,
      do_not_pick_team_numbers: doNotPickTeamNumbers,
    },
  };
  saveDevData(userId, data);
}

export function getDevGameProfile(userId: string): GameProfile {
  return getDevData(userId).gameProfile;
}

export function getDevBetsForMatch(userId: string, matchId: string): Bet[] {
  return (getDevData(userId).sandboxBets ?? []).filter(
    (bet) => bet.match_id === matchId && bet.status !== "cancelled"
  );
}

export function getDevBetForUser(
  userId: string,
  matchId: string,
  bettorId: string,
  currency: BetCurrency
): Bet | null {
  return getDevBetsForMatch(userId, matchId).find(
    (bet) => bet.user_id === bettorId && bet.currency === currency && bet.status !== "cancelled"
  ) ?? null;
}

export function getDevUserBets(userId: string, bettorId: string): BetWithMatch[] {
  const matches = getAllDevMatches(userId);
  const matchById = new Map(matches.map((match) => [match.id, match]));
  return (getDevData(userId).sandboxBets ?? [])
    .filter((bet) => bet.user_id === bettorId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((bet) => {
      const match = matchById.get(bet.match_id);
      return {
        ...bet,
        match: match ? {
          id: match.id,
          name: match.name,
          match_number: match.match_number,
          winning_alliance: match.winning_alliance,
          event_id: match.event_id,
        } : undefined,
      };
    });
}

export function createDevBet(
  userId: string,
  bettorId: string,
  matchId: string,
  alliance: BetAlliance,
  amount: number,
  currency: BetCurrency
): { success: boolean; error?: string } {
  const data = getDevData(userId);
  const match = getAllDevMatches(userId).find((item) => item.id === matchId);
  if (!match) return { success: false, error: "Sandbox match not found." };
  if (match.winning_alliance) return { success: false, error: "This match has already been settled." };
  if (getDevBetForUser(userId, matchId, bettorId, currency)) {
    return { success: false, error: "You already have an active bet on this match." };
  }

  const now = new Date().toISOString();
  const bet: Bet = {
    id: `dev-bet-${matchId}-${bettorId}-${currency}-${Date.now()}`,
    user_id: bettorId,
    match_id: matchId,
    alliance,
    amount,
    currency,
    status: "pending",
    payout: null,
    created_at: now,
    updated_at: now,
  };
  data.sandboxBets = [...(data.sandboxBets ?? []), bet];
  saveDevData(userId, data);
  return { success: true };
}

export function cancelDevBet(userId: string, betId: string, bettorId: string): boolean {
  const data = getDevData(userId);
  const bet = (data.sandboxBets ?? []).find((item) => item.id === betId && item.user_id === bettorId);
  if (!bet || bet.status !== "pending") return false;
  bet.status = "cancelled";
  bet.updated_at = new Date().toISOString();
  saveDevData(userId, data);
  return true;
}

export function updateDevBetSettlement(
  userId: string,
  betId: string,
  status: "won" | "lost",
  payout: number
): boolean {
  const data = getDevData(userId);
  const bet = (data.sandboxBets ?? []).find((item) => item.id === betId);
  if (!bet || bet.status !== "pending") return false;
  bet.status = status;
  bet.payout = payout;
  bet.updated_at = new Date().toISOString();
  saveDevData(userId, data);
  return true;
}

export function updateDevGameProfile(
  userId: string,
  updates: Partial<GameProfile>
): GameProfile {
  const data = getDevData(userId);
  data.gameProfile = {
    ...data.gameProfile,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  saveDevData(userId, data);
  return data.gameProfile;
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
  const match = getAllDevMatches(userId).find((m) => m.id === matchId);
  if (!match) return null;
  const column = roleColumn(role, slot) as keyof Match;
  (match as unknown as Record<string, string | null>)[column] = scouterId;
  saveDevData(userId, data);
  return match;
}

export function getDevRosters(userId: string, eventId: string): Roster[] {
  return getDevData(userId).sandboxRosters?.[eventId] ?? [];
}

export function createDevRoster(
  userId: string,
  eventId: string,
  name: string,
  description: string,
  assignments: Partial<Record<Role, string | null>>,
  assignments2: Partial<Record<Role, string | null>> = {}
): { success: boolean; roster?: Roster; error?: string } {
  const data = getDevData(userId);
  const eventExists = [data.event, ...(data.additionalEvents ?? [])].some((event) => event.id === eventId);
  if (!eventExists) return { success: false, error: "Sandbox event not found" };

  const rosters = data.sandboxRosters?.[eventId] ?? [];
  if (rosters.some((roster) => roster.name.toLowerCase() === name.toLowerCase())) {
    return { success: false, error: "A roster with this name already exists for this event" };
  }

  const now = new Date().toISOString();
  const roster = {
    id: `${DEV_ID_PREFIX}r${Date.now().toString(16).padStart(11, "0")}`,
    name,
    description: description || null,
    event_id: eventId,
    created_by: userId,
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
    created_at: now,
    updated_at: now,
  } satisfies Roster;
  const rosterColumns = roster as unknown as Record<string, string | null>;

  Object.entries(assignments).forEach(([role, scouterId]) => {
    const column = ROLE_TO_COLUMN[role as Role];
    if (column) rosterColumns[column] = scouterId ?? null;
  });
  Object.entries(assignments2).forEach(([role, scouterId]) => {
    const column = ROLE_TO_COLUMN_2[role as Role];
    if (column) rosterColumns[column] = scouterId ?? null;
  });

  data.sandboxRosters = { ...(data.sandboxRosters ?? {}), [eventId]: [...rosters, roster] };
  saveDevData(userId, data);
  return { success: true, roster };
}

export function updateDevRoster(
  userId: string,
  rosterId: string,
  updates: {
    name?: string;
    description?: string;
    assignments?: Partial<Record<Role, string | null>>;
    assignments2?: Partial<Record<Role, string | null>>;
  }
): { success: boolean; error?: string } {
  const data = getDevData(userId);
  for (const rosters of Object.values(data.sandboxRosters ?? {})) {
    const roster = rosters.find((item) => item.id === rosterId);
    if (!roster) continue;
    if (updates.name && rosters.some((item) => item.id !== rosterId && item.name.toLowerCase() === updates.name!.toLowerCase())) {
      return { success: false, error: "A roster with this name already exists for this event" };
    }
    if (updates.name) roster.name = updates.name;
    if (updates.description !== undefined) roster.description = updates.description || null;
    const rosterColumns = roster as unknown as Record<string, string | null>;
    Object.entries(updates.assignments ?? {}).forEach(([role, scouterId]) => {
      const column = ROLE_TO_COLUMN[role as Role];
      if (column) rosterColumns[column] = scouterId ?? null;
    });
    Object.entries(updates.assignments2 ?? {}).forEach(([role, scouterId]) => {
      const column = ROLE_TO_COLUMN_2[role as Role];
      if (column) rosterColumns[column] = scouterId ?? null;
    });
    roster.updated_at = new Date().toISOString();
    saveDevData(userId, data);
    return { success: true };
  }
  return { success: false, error: "Roster not found" };
}

export function deleteDevRoster(userId: string, rosterId: string): boolean {
  const data = getDevData(userId);
  for (const [eventId, rosters] of Object.entries(data.sandboxRosters ?? {})) {
    const filteredRosters = rosters.filter((roster) => roster.id !== rosterId);
    if (filteredRosters.length === rosters.length) continue;
    data.sandboxRosters![eventId] = filteredRosters;
    saveDevData(userId, data);
    return true;
  }
  return false;
}

export function applyDevRosterToMatches(
  userId: string,
  rosterId: string,
  matchIds: string[]
): { success: boolean; updated: number; error?: string } {
  const data = getDevData(userId);
  const roster = Object.values(data.sandboxRosters ?? {}).flat().find((item) => item.id === rosterId);
  if (!roster) return { success: false, updated: 0, error: "Roster not found" };

  const targetIds = new Set(matchIds);
  const allMatches = [data.matches, ...Object.values(data.additionalMatches ?? {})].flat();
  const targetMatches = allMatches.filter((match) =>
    targetIds.has(match.id) && match.event_id === roster.event_id
  );
  for (const match of targetMatches) {
    const matchColumns = match as unknown as Record<string, string | null>;
    const rosterColumns = roster as unknown as Record<string, string | null>;
    for (const role of Object.keys(ROLE_TO_COLUMN) as Role[]) {
      const primaryColumn = ROLE_TO_COLUMN[role];
      const secondaryColumn = ROLE_TO_COLUMN_2[role];
      matchColumns[primaryColumn] = rosterColumns[primaryColumn];
      matchColumns[secondaryColumn] = rosterColumns[secondaryColumn];
    }
  }
  saveDevData(userId, data);
  return { success: true, updated: targetMatches.length };
}
