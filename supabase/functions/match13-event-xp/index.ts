// Supabase Edge Function: match13 xP averages for every team at an event.
//
// Used by the Strategy Dashboard picklist to sort teams by match13 xP.
// match13's API sends no CORS headers and its key must stay server-side, so
// the browser asks this function instead of calling match13 directly.
//
// Request body: { eventCode: string }   // TBA event key, e.g. "2026casj"
//
// Response body:
// {
//   teams: Array<{ teamNumber: number, xp: number | null }>
// }
// `xp` is the team's mean xP across its matches at the event (match13's
// `xpMean`), falling back to its latest rating there (`xpEnd`) when no mean
// is available yet.
//
// Deploy: supabase functions deploy match13-event-xp
// Secrets required: M13_API_KEY
// (SUPABASE_URL and SUPABASE_ANON_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const M13_API_KEY = Deno.env.get("M13_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Match13EventTeams {
  eventKey: string;
  year: number;
  teams: Array<{
    teamNumber: number;
    xpMean: number | null;
    xpEnd: number | null;
  }>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Authentication required" }, 401);

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Invalid session" }, 401);

    const { eventCode } = await request.json() as { eventCode?: string };
    if (typeof eventCode !== "string" || !/^\d{4}[a-z0-9_-]+$/.test(eventCode)) {
      return jsonResponse({ error: "Provide a valid event code" }, 400);
    }

    if (!M13_API_KEY) {
      console.error("M13_API_KEY secret is not set");
      return jsonResponse({ error: "match13 is not configured" }, 500);
    }

    const res = await fetch(`https://actions.match13.com/v1/events/${eventCode}/teams`, {
      headers: { Authorization: `Bearer ${M13_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    // match13 404s an event it has no data on yet (e.g. before it starts).
    if (res.status === 404) return jsonResponse({ teams: [] });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`match13 event teams ${eventCode} -> ${res.status}: ${body}`);
      return jsonResponse({ error: "match13 request failed" }, 502);
    }

    const data = await res.json() as Match13EventTeams;
    const teams = (data.teams ?? []).map((team) => ({
      teamNumber: team.teamNumber,
      xp: team.xpMean ?? team.xpEnd ?? null,
    }));
    return jsonResponse({ teams });
  } catch (error) {
    console.error("match13-event-xp error:", error);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});
