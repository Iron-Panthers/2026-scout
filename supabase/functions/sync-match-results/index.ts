// Supabase Edge Function: Sync match results from TBA + Statbotics into the matches table.
//
// Called from the Betting page on load to ensure winning_alliance is up-to-date
// before the client renders bet/settle state.
//
// Request body: (none required — operates on the active event automatically)
//
// Response body:
// {
//   updated: number,           // matches whose winning_alliance was just set
//   alreadySettled: number,    // matches already had winning_alliance
//   eventCode: string | null
// }
//
// Deploy: supabase functions deploy sync-match-results --no-verify-jwt
// Secrets required: TBA_AUTH_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TBA_AUTH_KEY = Deno.env.get("TBA_AUTH_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TBAMatch {
  key: string;
  comp_level: string;
  match_number: number;
  alliances: {
    red: { score: number; team_keys: string[] };
    blue: { score: number; team_keys: string[] };
  };
}

interface StatboticsMatch {
  key: string;
  comp_level: string;
  match_number: number;
  /** Unix timestamp (seconds) of predicted match start time */
  time?: number | null;
  pred: {
    red_win_prob: number; // 0–1
    red_score: number;
    blue_score: number;
  } | null;
  result: {
    winner: "red" | "blue" | "tie" | null;
    red_score: number | null;
    blue_score: number | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive winner from TBA alliance scores. Returns null if match not yet played. */
function tbaWinner(match: TBAMatch): "red" | "blue" | "tie" | null {
  const red = match.alliances.red.score;
  const blue = match.alliances.blue.score;
  if (red < 0 || blue < 0) return null; // -1 = not played
  if (red > blue) return "red";
  if (blue > red) return "blue";
  return "tie";
}

async function fetchTBA<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3${path}`, {
      headers: { "X-TBA-Auth-Key": TBA_AUTH_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchStatbotics<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.statbotics.io/v3${path}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get active event
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, event_code")
      .eq("is_active", true)
      .limit(1);

    if (eventsError || !events || events.length === 0) {
      return json({ updated: 0, alreadySettled: 0, eventCode: null }, 200);
    }

    const event = events[0];
    const eventCode: string = event.event_code;

    if (!eventCode) {
      return json({ updated: 0, alreadySettled: 0, eventCode: null }, 200);
    }

    // 2. Get all matches for this event from DB
    const { data: dbMatches, error: matchesError } = await supabase
      .from("matches")
      .select("id, match_number, winning_alliance")
      .eq("event_id", event.id);

    if (matchesError || !dbMatches || dbMatches.length === 0) {
      return json({ updated: 0, alreadySettled: 0, eventCode }, 200);
    }

    // 3. Fetch results from TBA and Statbotics in parallel
    const [tbaMatches, sbMatches] = await Promise.all([
      fetchTBA<TBAMatch[]>(`/event/${eventCode}/matches`),
      fetchStatbotics<StatboticsMatch[]>(`/event_matches?event=${eventCode}&limit=200`),
    ]);

    // Build lookup maps by match_number (qual matches only)
    const tbaByNum = new Map<number, TBAMatch>();
    if (tbaMatches) {
      for (const m of tbaMatches) {
        if (m.comp_level === "qm") tbaByNum.set(m.match_number, m);
      }
    }

    const sbByNum = new Map<number, StatboticsMatch>();
    if (sbMatches) {
      for (const m of sbMatches) {
        if (m.comp_level === "qm") sbByNum.set(m.match_number, m);
      }
    }

    // 4. Update matches: winning_alliance for newly-played matches,
    //    and statbotics_red_win_prob whenever Statbotics has prediction data.
    let updated = 0;
    let alreadySettled = 0;
    let predUpdated = 0;

    for (const dbMatch of dbMatches) {
      const tba = tbaByNum.get(dbMatch.match_number);
      const sb = sbByNum.get(dbMatch.match_number);

      const fieldsToUpdate: Record<string, unknown> = {};

      // Store Statbotics win probability and pred_time whenever available
      if (sb?.pred && typeof sb.pred.red_win_prob === "number") {
        fieldsToUpdate.statbotics_red_win_prob = sb.pred.red_win_prob;
      }
      if (sb?.time) {
        fieldsToUpdate.pred_time = new Date(sb.time * 1000).toISOString();
      }

      if (dbMatch.winning_alliance) {
        alreadySettled++;
      } else {
        // TBA is the authoritative source; Statbotics is the fallback
        const winner = (tba ? tbaWinner(tba) : null) ?? sb?.result?.winner ?? null;
        if (winner) fieldsToUpdate.winning_alliance = winner;
      }

      if (Object.keys(fieldsToUpdate).length === 0) continue;

      const { error: updateError } = await supabase
        .from("matches")
        .update(fieldsToUpdate)
        .eq("id", dbMatch.id);

      if (!updateError) {
        if (fieldsToUpdate.winning_alliance) updated++;
        if (fieldsToUpdate.statbotics_red_win_prob !== undefined) predUpdated++;
      }
    }

    return json({ updated, alreadySettled, predUpdated, eventCode }, 200);
  } catch (err: any) {
    console.error("sync-match-results error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
