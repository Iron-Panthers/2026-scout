/**
 * Statbotics v3 API client
 * Public API (no auth key). Docs: https://api.statbotics.io/docs
 *
 * Match win-probability predictions come from match13 now (see
 * src/lib/match13.ts) — this file is kept only for team EPA ratings
 * (used to sort/rank teams in the picklist), which match13 doesn't cover.
 */

const BASE_URL = "https://api.statbotics.io/v3";

const CACHE_PFX = "sb_";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatboticsTeamEvent {
  team: number;
  event: string;
  team_name?: string;
  epa: number;
  rank: number | null;
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
// Team EPAs for an event (one request for the whole event)
// ---------------------------------------------------------------------------

const TTL_TEAM_EVENTS = 30 * 60 * 1000; // 30 min

export async function getStatboticsEventTeams(
  eventCode: string
): Promise<StatboticsTeamEvent[]> {
  const cKey = CACHE_PFX + "te_" + eventCode;

  try {
    const raw = localStorage.getItem(cKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as {
        data: StatboticsTeamEvent[];
        ts: number;
      };
      if (Date.now() - ts < TTL_TEAM_EVENTS) return data;
    }
  } catch { /* ignore */ }

  const data = await sbFetch<StatboticsTeamEvent[]>(
    `/team_events?event=${eventCode}&metric=epa&ascending=false&limit=1000`
  );
  if (!data || !Array.isArray(data)) return [];

  try {
    localStorage.setItem(cKey, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* ignore */ }

  return data;
}

/** Team number -> current EPA rating, for sorting/ranking teams at an event. */
export async function getEventEpaMap(eventCode: string): Promise<Map<number, number>> {
  const teamEvents = await getStatboticsEventTeams(eventCode);
  const map = new Map<number, number>();
  for (const t of teamEvents) {
    if (typeof t.epa === "number") map.set(t.team, t.epa);
  }
  return map;
}
