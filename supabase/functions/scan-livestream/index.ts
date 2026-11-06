// Supabase Edge Function: start scanning an event livestream for matches.
//
// Called by the app after a manager adds (or retries) a livestream in event_livestreams.
// Scanning means downloading the stream and reading its overlay, which takes far longer
// than an edge function may run, so this only starts the livestream-clips GitHub Actions
// workflow (.github/workflows/livestream-clips.yml), which does the work and records the
// result on the livestream row.
//
// Request body: { livestreamId: string }
// Response body: { status: "queued" } or { error: string }
//
// Deploy: supabase functions deploy scan-livestream
// Secrets required:
//   GITHUB_TOKEN  a fine-grained token for the repository with "Actions: Read and write"
//   GITHUB_REPO   e.g. "Iron-Panthers/2026-scout"
//   GITHUB_REF    optional; the branch holding the workflow (default "main")
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Trimmed: a token pasted with a trailing newline is rejected as a bad credential
const GITHUB_TOKEN = Deno.env.get("ETHAN_CANT_CODE_HE_CAN_ONLY_CLAUDE")?.trim();
const GITHUB_REPO = Deno.env.get("GITHUB_REPO");
const GITHUB_REF = Deno.env.get("GITHUB_REF") || "main";

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

    const database = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile } = await database.from("profiles").select("is_manager").eq("id", user.id).single();
    if (!profile?.is_manager) return jsonResponse({ error: "Only managers can scan livestreams." }, 403);

    const { livestreamId } = await request.json() as { livestreamId?: string };
    if (!livestreamId) return jsonResponse({ error: "livestreamId is required" }, 400);

    const { data: livestream } = await database.from("event_livestreams").select("id, status").eq("id", livestreamId).single();
    if (!livestream) return jsonResponse({ error: "Livestream not found" }, 404);
    if (livestream.status === "processing") return jsonResponse({ error: "This livestream is already being scanned." }, 409);

    // Recorded on the livestream (not just returned), so it shows as failed and can be retried
    const fail = async (error: string, status: number) => {
      await database
        .from("event_livestreams")
        .update({ status: "failed", error, updated_at: new Date().toISOString() })
        .eq("id", livestreamId);
      return jsonResponse({ error }, status);
    };
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      return fail("Livestream scanning isn't set up yet (GITHUB_TOKEN / GITHUB_REPO secrets).", 500);
    }

    const dispatch = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/livestream-clips.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: GITHUB_REF, inputs: { livestream_id: livestreamId } }),
      }
    );
    if (!dispatch.ok) {
      const detail = await dispatch.text();
      console.error("GitHub dispatch failed:", dispatch.status, detail);
      // GitHub's own reason (e.g. "Bad credentials", "Resource not accessible by personal access token")
      let reason = "";
      try {
        reason = (JSON.parse(detail) as { message?: string }).message ?? "";
      } catch {
        // Not JSON; the status code says enough
      }
      const githubSaid = reason ? ` GitHub said: "${reason}" (${dispatch.status}).` : ` (${dispatch.status})`;
      return fail(
        dispatch.status === 404
          ? `Couldn't start the scan: GitHub can't find the livestream-clips workflow (is it on the main branch?) or the token can't see the repository.${githubSaid}`
          : dispatch.status === 401 || dispatch.status === 403
            ? `Couldn't start the scan: GitHub rejected the token (expired, or missing Actions write access).${githubSaid}`
            : `Couldn't start the scan on GitHub.${githubSaid}`,
        502
      );
    }

    await database
      .from("event_livestreams")
      .update({ status: "queued", error: null, updated_at: new Date().toISOString() })
      .eq("id", livestreamId);
    return jsonResponse({ status: "queued" });
  } catch (error) {
    console.error("scan-livestream error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
