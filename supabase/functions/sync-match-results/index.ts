// Supabase Edge Function: Sync match results from TBA + predictions from
// match13 into the matches table.
//
// Called from the Betting page on load to ensure winning_alliance is up-to-date
// before the client renders bet/settle state, and to fetch match13 predictions
// (match13's API sends no CORS headers and its key must stay server-side, so
// this is the only place that can call it — the browser reads predictions
// back from this function's response / the match13_red_win_prob column it
// writes, never match13 directly).
//
// Request body: (none required — operates on the active event automatically)
//
// Response body:
// {
//   updated: number,           // matches whose winning_alliance was just set
//   alreadySettled: number,    // matches already had winning_alliance
//   eventCode: string | null,
//   predictions: Array<{ matchNumber, redWinProb, redScore, blueScore }>
// }
//
// Deploy: supabase functions deploy sync-match-results --no-verify-jwt
// Secrets required: TBA_AUTH_KEY, M13_API_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TBA_AUTH_KEY = Deno.env.get("TBA_AUTH_KEY")!;
const M13_API_KEY = Deno.env.get("M13_API_KEY")!;

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
  /** Unix timestamp (seconds) of the scheduled/predicted match start */
  predicted_time?: number | null;
  alliances: {
    red: { score: number; team_keys: string[] };
    blue: { score: number; team_keys: string[] };
  };
}

interface Match13EventMatches {
  eventKey: string;
  year: number;
  matches: Array<{
    key: string;
    bye?: boolean;
    pred: {
      winProb: number; // 0–1, chance red wins
      redScore: number;
      blueScore: number;
    };
  }>;
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

/** Qual match number parsed from a match13/TBA-style key ("2025casj_qm42" -> 42). */
function qualMatchNumber(key: string): number | null {
  const m = key.match(/_qm(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
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

async function fetchMatch13<T>(path: string): Promise<T | null> {
  if (!M13_API_KEY) {
    console.error("M13_API_KEY secret is not set — skipping match13 fetch");
    return null;
  }
  try {
    const res = await fetch(`https://actions.match13.com${path}`, {
      headers: { Authorization: `Bearer ${M13_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`match13 ${path} -> ${res.status} ${res.statusText}: ${body}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`match13 ${path} threw:`, err);
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
      .select("id, match_number, winning_alliance, red_score, blue_score")
      .eq("event_id", event.id);

    if (matchesError || !dbMatches || dbMatches.length === 0) {
      return json({ updated: 0, alreadySettled: 0, eventCode }, 200);
    }

    // 3. Fetch results from TBA and predictions from match13 in parallel
    const [tbaMatches, m13Data] = await Promise.all([
      fetchTBA<TBAMatch[]>(`/event/${eventCode}/matches`),
      fetchMatch13<Match13EventMatches>(`/v1/events/${eventCode}/matches`),
    ]);

    // Build lookup maps by match_number (qual matches only)
    const tbaByNum = new Map<number, TBAMatch>();
    if (tbaMatches) {
      for (const m of tbaMatches) {
        if (m.comp_level === "qm") tbaByNum.set(m.match_number, m);
      }
    }

    const m13ByNum = new Map<number, { redWinProb: number; redScore: number; blueScore: number }>();
    if (m13Data?.matches) {
      for (const m of m13Data.matches) {
        if (m.bye || !m.pred) continue;
        const num = qualMatchNumber(m.key);
        if (num == null) continue;
        m13ByNum.set(num, {
          redWinProb: m.pred.winProb,
          redScore: m.pred.redScore,
          blueScore: m.pred.blueScore,
        });
      }
    }

    // 4. Update matches: winning_alliance for newly-played matches (TBA is
    //    authoritative — match13 never reports actual results, only
    //    forecasts), and match13_red_win_prob whenever match13 has a
    //    prediction. pred_time also comes from TBA now, since match13's API
    //    carries no scheduled/predicted match time.
    let updated = 0;
    let alreadySettled = 0;
    let predUpdated = 0;
    const predictions: Array<{
      matchNumber: number;
      redWinProb: number;
      redScore: number;
      blueScore: number;
    }> = [];

    for (const dbMatch of dbMatches) {
      const tba = tbaByNum.get(dbMatch.match_number);
      const m13 = m13ByNum.get(dbMatch.match_number);

      const fieldsToUpdate: Record<string, unknown> = {};

      if (m13) {
        fieldsToUpdate.match13_red_win_prob = m13.redWinProb;
        predictions.push({ matchNumber: dbMatch.match_number, ...m13 });
      }
      if (tba?.predicted_time) {
        fieldsToUpdate.pred_time = new Date(tba.predicted_time * 1000).toISOString();
      }

      // Save scores once available — TBA is the only source of actual results
      if (dbMatch.red_score == null || dbMatch.blue_score == null) {
        const tbaRed = tba?.alliances?.red?.score;
        const tbaBlue = tba?.alliances?.blue?.score;
        if (tbaRed != null && tbaBlue != null && tbaRed >= 0 && tbaBlue >= 0) {
          fieldsToUpdate.red_score = tbaRed;
          fieldsToUpdate.blue_score = tbaBlue;
        }
      }

      if (dbMatch.winning_alliance) {
        alreadySettled++;
      } else {
        const winner = tba ? tbaWinner(tba) : null;
        if (winner) fieldsToUpdate.winning_alliance = winner;
      }

      if (Object.keys(fieldsToUpdate).length === 0) continue;

      const { error: updateError } = await supabase
        .from("matches")
        .update(fieldsToUpdate)
        .eq("id", dbMatch.id);

      if (!updateError) {
        if (fieldsToUpdate.winning_alliance) updated++;
        if (fieldsToUpdate.match13_red_win_prob !== undefined) predUpdated++;
      }
    }

    return json({ updated, alreadySettled, predUpdated, eventCode, predictions }, 200);
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
