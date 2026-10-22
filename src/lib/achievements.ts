import { supabase } from "@/lib/supabase";
import { addDevAchievement, getDevAchievements, getDevScoutedEventSummaries, isDevModeActive } from "@/lib/devMode";
import { getScoutedEvents, type ScoutedEvent } from "@/lib/scoutingHistory";

/**
 * Achievements come two ways, and anyone viewing a profile sees the same ones:
 *   - worked out live from what's already public on a scouter's profile (events and
 *     matches scouted, team years, event leaderboards);
 *   - "unlocked" the moment they happen, for things only the scouter can see (FRCdle
 *     rolls, owned cosmetics, picklists, bets, pages they open), and saved in
 *     user_achievements via unlockAchievement().
 */

export type AchievementIcon =
  | "clipboard"
  | "map"
  | "trophy"
  | "users"
  | "crown"
  | "bug"
  | "star"
  | "calendar"
  | "globe"
  | "sparkles"
  | "shirt"
  | "flame"
  | "house"
  | "dice"
  | "list"
  | "eye"
  | "trending";

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  /** How far along the scouter is, and the target; earned once progress reaches the goal. */
  measure: (data: AchievementData) => number;
  goal: number;
  /** Hidden until earned: shown as "???" (name, description, icon and progress). */
  secret?: boolean;
}

export interface AchievementData {
  events: ScoutedEvent[];
  teamYears: number[];
  /** Events where they had the most submissions on the leaderboard (ties count). */
  topScoutEvents: number;
  /** Achievements saved as they happened (user_achievements). */
  unlocked: Set<string>;
}

export interface AchievementProgress extends AchievementDefinition {
  progress: number;
  earned: boolean;
  /** Points paid once, when it's earned. */
  points: number;
}

const matchesScouted = (data: AchievementData) => data.events.reduce((sum, event) => sum + (event.matchesScouted ?? 0), 0);
const seasonsScouted = (data: AchievementData) =>
  new Set(data.events.map((event) => event.startDate?.slice(0, 4) ?? event.eventCode?.slice(0, 4)).filter(Boolean)).size;
const isChampionship = (event: ScoutedEvent) => /\b(division|einstein|championship)\b/i.test(event.name);
const mostMatchesAtOneEvent = (data: AchievementData) => Math.max(0, ...data.events.map((event) => event.matchesScouted ?? 0));
/** For achievements earned in the moment: done once it's been unlocked. */
const unlocked = (id: string) => (data: AchievementData) => (data.unlocked.has(id) ? 1 : 0);

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Scouting
  { id: "first_match", name: "First Scout", description: "Scout your first match", icon: "clipboard", measure: matchesScouted, goal: 1 },
  { id: "matches_25", name: "Getting the Hang of It", description: "Scout 25 matches", icon: "clipboard", measure: matchesScouted, goal: 25 },
  { id: "matches_100", name: "Centurion", description: "Scout 100 matches", icon: "clipboard", measure: matchesScouted, goal: 100 },
  { id: "matches_250", name: "Scouting Machine", description: "Scout 250 matches", icon: "clipboard", measure: matchesScouted, goal: 250 },
  // Events
  { id: "events_1", name: "On the Map", description: "Scout at an event", icon: "map", measure: (d) => d.events.length, goal: 1 },
  { id: "events_5", name: "Road Warrior", description: "Scout at 5 events", icon: "map", measure: (d) => d.events.length, goal: 5 },
  { id: "events_10", name: "Globetrotter", description: "Scout at 10 events", icon: "globe", measure: (d) => d.events.length, goal: 10 },
  {
    id: "championship",
    name: "World Stage",
    description: "Scout at the FIRST Championship",
    icon: "trophy",
    measure: (d) => (d.events.some(isChampionship) ? 1 : 0),
    goal: 1,
  },
  { id: "seasons_3", name: "Through the Years", description: "Scout events in 3 different seasons", icon: "calendar", measure: seasonsScouted, goal: 3 },
  // Team
  { id: "no_life", name: "No Life", description: "Scout 50+ matches at a single event", icon: "flame", measure: mostMatchesAtOneEvent, goal: 50, secret: true },
  { id: "veteran", name: "Veteran", description: "Be on the team for 3 seasons", icon: "users", measure: (d) => d.teamYears.length, goal: 3 },
  {
    id: "top_scout",
    name: "Top Scout",
    description: "Have the most submissions at an event",
    icon: "star",
    measure: (d) => d.topScoutEvents,
    goal: 1,
  },
  // Strategy
  { id: "picklist", name: "Strategist", description: "Complete a picklist (sort every team)", icon: "list", measure: unlocked("picklist"), goal: 1 },
  { id: "match_view", name: "Analyst", description: "View a match in the match dashboard", icon: "eye", measure: unlocked("match_view"), goal: 1 },
  // Betting
  {
    id: "upset",
    name: "Called It",
    description: "Win a bet on an alliance with under a 20% chance of winning",
    icon: "trending",
    measure: unlocked("upset"),
    goal: 1,
    secret: true,
  },
  // FRCdle
  { id: "mythic", name: "Mythic", description: "Get a Mythic roll in FRCdle", icon: "sparkles", measure: unlocked("mythic"), goal: 1, secret: true },
  {
    id: "frcdle_5026",
    name: "Home Team",
    description: "Roll 5026 somewhere in an FRCdle number",
    icon: "house",
    measure: unlocked("frcdle_5026"),
    goal: 1,
    secret: true,
  },
  {
    id: "full_roll",
    name: "Perfect Roll",
    description: "Roll every FRC team across all your FRCdle rolls",
    icon: "dice",
    measure: unlocked("full_roll"),
    goal: 1,
    secret: true,
  },
  // Shop
  { id: "collector", name: "Collector", description: "Own every cosmetic item", icon: "shirt", measure: unlocked("collector"), goal: 1 },
];

export type UnlockableAchievement = "picklist" | "match_view" | "upset" | "mythic" | "frcdle_5026" | "full_roll" | "collector";

/**
 * Points each achievement pays (once, when it's earned). The database pays them from its
 * own copy: keep these in sync with achievement_rewards
 * (supabase/migrations/20261020030_add_achievement_points.sql).
 */
export const ACHIEVEMENT_POINTS: Record<string, number> = {
  first_match: 10,
  matches_25: 400,
  matches_100: 1000,
  matches_250: 3000,
  events_1: 25,
  events_5: 500,
  events_10: 2000,
  championship: 100,
  seasons_3: 1000,
  no_life: 1000,
  veteran: 800,
  top_scout: 500,
  picklist: 100,
  match_view: 10,
  upset: 150,
  mythic: 200,
  frcdle_5026: 200,
  full_roll: 200000,
  collector: 1500,
};

import { ACHIEVEMENT_UNLOCKED_EVENT } from "@/lib/achievementEvents";
export { ACHIEVEMENT_UNLOCKED_EVENT, ACHIEVEMENT_CHECK_EVENT, requestAchievementCheck } from "@/lib/achievementEvents";

// Already saved (or being saved) this session, so repeat checks don't hit the database
const unlockedThisSession = new Set<string>();

function announce(id: string) {
  const achievement = ACHIEVEMENTS.find((a) => a.id === id);
  if (achievement) {
    window.dispatchEvent(
      new CustomEvent(ACHIEVEMENT_UNLOCKED_EVENT, { detail: { ...achievement, points: ACHIEVEMENT_POINTS[achievement.id] ?? 0 } })
    );
  }
}

/**
 * Records an achievement earned in the moment (no-op if they already have it), paying its
 * points, and announces it if it's new. In the developer sandbox it's recorded in the
 * sandbox's own data (and pays sandbox points), never the real account.
 */
export async function unlockAchievement(userId: string | null | undefined, id: UnlockableAchievement | string): Promise<void> {
  if (!userId) return;
  if (isDevModeActive()) {
    if (addDevAchievement(userId, id, ACHIEVEMENT_POINTS[id] ?? 0)) announce(id);
    return;
  }
  const sessionKey = `${userId}:${id}`;
  if (unlockedThisSession.has(sessionKey)) return;
  unlockedThisSession.add(sessionKey);
  const { data, error } = await supabase
    .from("user_achievements")
    .upsert({ user_id: userId, achievement_id: id }, { onConflict: "user_id,achievement_id", ignoreDuplicates: true })
    .select("achievement_id");
  if (error) {
    unlockedThisSession.delete(sessionKey); // try again next time
    console.error("Error recording achievement:", error);
    return;
  }
  // A row back means it was just inserted (an existing one is ignored and not returned)
  if (data && data.length > 0) announce(id);
}

/**
 * Achievements earned from live profile data (matches, events, team years...) aren't
 * saved when they happen; this records the ones they've reached but not been paid for yet,
 * which pays out their points. Only for the signed-in scouter's own achievements.
 */
export function claimEarnedAchievements(userId: string, achievements: AchievementProgress[], data: AchievementData) {
  for (const achievement of achievements) {
    if (achievement.earned && !data.unlocked.has(achievement.id)) void unlockAchievement(userId, achievement.id);
  }
}

export function evaluateAchievements(data: AchievementData): AchievementProgress[] {
  return ACHIEVEMENTS.map((achievement) => {
    const progress = achievement.measure(data);
    return {
      ...achievement,
      progress: Math.min(progress, achievement.goal),
      earned: progress >= achievement.goal,
      points: ACHIEVEMENT_POINTS[achievement.id] ?? 0,
    };
  });
}

/**
 * The sandbox's version of the data: its own scouting history and the achievements earned
 * there, starting from nothing (no team years or leaderboard wins carried over).
 */
export function getDevAchievementData(userId: string): AchievementData {
  const events: ScoutedEvent[] = getDevScoutedEventSummaries(userId).map((event) => ({
    key: event.eventId,
    name: event.name,
    eventCode: event.eventCode,
    location: null,
    startDate: null,
    endDate: null,
    matchesScouted: event.matches,
    submissions: event.matches,
  }));
  return { events, teamYears: [], topScoutEvents: 0, unlocked: getDevAchievements(userId) };
}

/** Everything the achievements are worked out from, for one scouter. */
export async function getAchievementData(
  userId: string,
  teamYears: number[],
  events?: ScoutedEvent[],
  /** Which events' leaderboards to bring up to date first (see getScoutedEvents). */
  refresh: "all" | "active" = "all"
): Promise<AchievementData> {
  const scouted = events ?? (await getScoutedEvents(userId, refresh));
  // Leaderboards only exist for events the app recorded (not ones the scouter added)
  const recordedEventIds = scouted.filter((event) => !event.addedByScouter).map((event) => event.key);

  const [leaderboards, saved] = await Promise.all([
    recordedEventIds.length > 0
      ? supabase.from("event_leaderboards").select("event_id, scouter_id, submission_count").in("event_id", recordedEventIds)
      : Promise.resolve({ data: [] as Array<{ event_id: string; scouter_id: string; submission_count: number }>, error: null }),
    supabase.from("user_achievements").select("achievement_id").eq("user_id", userId),
  ]);
  if (saved.error) console.error("Error loading achievements:", saved.error);
  if (leaderboards.error) console.error("Error loading leaderboards:", leaderboards.error);

  // Events where nobody had more submissions than them
  const best = new Map<string, number>();
  const mine = new Map<string, number>();
  for (const row of (leaderboards.data ?? []) as Array<{ event_id: string; scouter_id: string; submission_count: number }>) {
    best.set(row.event_id, Math.max(best.get(row.event_id) ?? 0, row.submission_count));
    if (row.scouter_id === userId) mine.set(row.event_id, row.submission_count);
  }
  const topScoutEvents = [...mine.entries()].filter(([eventId, count]) => count > 0 && count >= (best.get(eventId) ?? 0)).length;

  return {
    events: scouted,
    teamYears,
    topScoutEvents,
    unlocked: new Set(((saved.data ?? []) as Array<{ achievement_id: string }>).map((row) => row.achievement_id)),
  };
}
