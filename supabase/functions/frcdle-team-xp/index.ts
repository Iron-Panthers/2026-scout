import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const body = await request.json() as { teamNumbers?: number[] };
    const teamNumbers = body.teamNumbers;
    if (!Array.isArray(teamNumbers) || teamNumbers.length > 3 || teamNumbers.some(
      (number) => !Number.isInteger(number) || number < 1 || number > 9999
    )) {
      return jsonResponse({ error: "Provide at most three valid FRC team numbers" }, 400);
    }

    const results: Array<{ teamNumber: number; xp: number | null }> = [];
    for (let index = 0; index < teamNumbers.length; index++) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2000));

      const teamNumber = teamNumbers[index];
      try {
        const response = await fetch(`https://www.match13.com/team/${teamNumber}`, {
          headers: { Accept: "text/markdown" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          results.push({ teamNumber, xp: null });
          continue;
        }
        const markdown = await response.text();
        const match = markdown.match(/xP rating:\s*\*\*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\*\*/i);
        results.push({ teamNumber, xp: match ? Number(match[1]) : null });
      } catch (error) {
        console.warn(`Could not load Match13 xP for team ${teamNumber}:`, error);
        results.push({ teamNumber, xp: null });
      }
    }

    return jsonResponse({ results });
  } catch (error) {
    console.error("frcdle-team-xp error:", error);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});