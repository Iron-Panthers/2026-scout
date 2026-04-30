/**
 * Statbotics v3 API client
 * Public API (no auth key). Docs: https://api.statbotics.io/docs
 */

const BASE_URL = "https://api.statbotics.io/v3";

// Cache TTLs
const TTL_PENDING = 3 * 60 * 1000;         // 3 min for unplayed matches
const TTL_PLAYED  = 7 * 24 * 60 * 60 * 1000; // 1 week for played (stable)
const CACHE_PFX   = "sb_";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatboticsPred {
  winner: "red" | "blue" | null;
  red_win_prob: number; // 0–1
  red_score: number;
  blue_score: number;
}

export interface StatboticsResult {
  winner: "red" | "blue" | "tie" | null;
  red_score: number | null;
  blue_score: number | null;
  red_auto_points: number | null;
  blue_auto_points: number | null;
}

export interface StatboticsMatch {
  key: string;
  event: string;
  match_number: number;
  comp_level: string;
  /** Unix timestamp (seconds) of predicted match start time. May be null/absent. */
  time?: number | null;
  pred: StatboticsPred;
  result: StatboticsResult;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function sbFetch<T>(endpoint: string): Promise<T | null> {
  try {
    const r = await fetch(BASE_URL + endpoint, {
      signal: AbortSignal.timeout(160000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single match
// ---------------------------------------------------------------------------

export async function getStatboticsMatch(
  eventCode: string,
  matchNumber: number
): Promise<StatboticsMatch | null> {
  const matchKey = `${eventCode}_qm${matchNumber}`;
  const cKey = CACHE_PFX + matchKey;

  try {
    const raw = localStorage.getItem(cKey);
    if (raw) {
      const { data, ts, stable } = JSON.parse(raw) as {
        data: StatboticsMatch;
        ts: number;
        stable: boolean;
      };
      console.log(data, ts, stable, raw, cKey)
      if (stable || Date.now() - ts < TTL_PENDING) return data;
    }
  } catch { /* ignore */ }

  const data = await sbFetch<StatboticsMatch>(`/match/${matchKey}`);
  if (!data) return null;

  try {
    const stable = !!data.result?.winner;
    localStorage.setItem(cKey, JSON.stringify({ data, ts: Date.now(), stable }));
    // Log pred_time separately for easy access and debugging
    if (data.time) {
      const predTimeIso = new Date(data.time * 1000).toISOString();
      localStorage.setItem(`pred_time_${matchKey}`, predTimeIso);
      console.log(`[Statbotics] ${matchKey} predicted start: ${predTimeIso}`);
    }
  } catch { /* ignore */ }

  return data;
}

// ---------------------------------------------------------------------------
// All matches for an event (one request for the whole lobby)
// ---------------------------------------------------------------------------

export async function getStatboticsEventMatches(
  eventCode: string
): Promise<StatboticsMatch[]> {
  const cKey = CACHE_PFX + "ev_" + eventCode;

  try {
    const raw = localStorage.getItem(cKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as {
        data: StatboticsMatch[];
        ts: number;
      };
      if (Date.now() - ts < TTL_PENDING) return data;
    }
  } catch { /* ignore */ }

  const data = await sbFetch<StatboticsMatch[]>(
    `/matches?event=${eventCode}&limit=200`
  );
  if (!data || !Array.isArray(data)) return [];

  try {
    localStorage.setItem(cKey, JSON.stringify({ data, ts: Date.now() }));
    // Also cache each match individually so the detail page can use it offline
    for (const m of data) {
      const stable = !!m.result?.winner;
      const ttl = stable ? TTL_PLAYED : TTL_PENDING;
      localStorage.setItem(
        CACHE_PFX + m.key,
        JSON.stringify({ data: m, ts: Date.now() - (TTL_PLAYED - ttl), stable })
      );
      // Log pred_time for each match
      if (m.time) {
        const predTimeIso = new Date(m.time * 1000).toISOString();
        localStorage.setItem(`pred_time_${m.key}`, predTimeIso);
      }
    }
  } catch { /* ignore */ }

  return data;
}

// ---------------------------------------------------------------------------
// Offline-only retrieval (no network request)
// ---------------------------------------------------------------------------

export function getCachedStatboticsMatch(
  eventCode: string,
  matchNumber: number
): StatboticsMatch | null {
  try {
    const raw = localStorage.getItem(CACHE_PFX + `${eventCode}_qm${matchNumber}`);
    if (!raw) return null;
    return (JSON.parse(raw) as { data: StatboticsMatch }).data ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns label for how lopsided a match is predicted to be. */
export function getMatchLabel(redWinProb: number): {
  label: string;
  flavor: "coinflip" | "slight" | "heavy" | "dominant";
} {
  const pMax = Math.max(redWinProb, 1 - redWinProb);
  if (pMax < 0.57) return { label: "Coin Flip", flavor: "coinflip" };
  if (pMax < 0.70) return { label: "Slight Favorite", flavor: "slight" };
  if (pMax < 0.85) return { label: "Heavy Favorite", flavor: "heavy" };
  return { label: "Dominant Favorite", flavor: "dominant" };
}

/** Whether the winning side was the predicted underdog. */
export function wasUpset(
  winner: "red" | "blue" | "tie",
  redWinProb: number
): boolean {
  if (winner === "tie") return false;
  const winnerProb = winner === "red" ? redWinProb : 1 - redWinProb;
  return winnerProb < 0.45;
}
