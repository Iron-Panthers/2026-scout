import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function localSpinDay(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const minuteOfDay = Number(value("hour")) * 60 + Number(value("minute"));
  const date = new Date(Date.UTC(year, month - 1, day - (minuteOfDay < 9 * 60 ? 1 : 0)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function randomSixDigitNumber(): string {
  const value = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 1_000_000) * 1_000_000;
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Authentication required" }, 401);

  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: "Invalid session" }, 401);

    const body = await request.json() as { action?: string; timeZone?: string };
    if (body.action !== "status" && body.action !== "spin" && body.action !== "reset" && body.action !== "top" && body.action !== "leaderboard") {
      return jsonResponse({ error: "Action must be status, spin, reset, top, or leaderboard" }, 400);
    }

    const timeZone = body.timeZone || "UTC";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    } catch {
      return jsonResponse({ error: "Invalid time zone" }, 400);
    }

    const database = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: latestSpin, error: latestError } = await database
      .from("frcdle_spins")
      .select("time_zone")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) return jsonResponse({ error: "Could not load spin history" }, 500);
    const effectiveTimeZone = latestSpin?.time_zone ?? timeZone;
    const spinDay = localSpinDay(effectiveTimeZone);

    // Every player's roll for this spin day (the caller's included, flagged),
    // so the client can score them against its season snapshot and show the
    // day's best one. RLS keeps
    // frcdle_spins private per user, so this goes through the service role.
    if (body.action === "top") {
      const { data: spins, error: spinsError } = await database
        .from("frcdle_spins")
        .select("user_id, spin_number, created_at")
        .eq("spin_day", spinDay);
      if (spinsError) return jsonResponse({ error: "Could not load today's spins" }, 500);

      const userIds = [...new Set((spins ?? []).map((spin) => spin.user_id))];
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await database.from("profiles").select("id, name").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) return jsonResponse({ error: "Could not load players" }, 500);
      const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.name as string | null]));

      return jsonResponse({
        spinDay,
        spins: (spins ?? []).map((spin) => ({
          spin_number: spin.spin_number,
          created_at: spin.created_at,
          name: nameById.get(spin.user_id) ?? null,
          is_you: spin.user_id === user.id,
        })),
      });
    }

    // Every roll ever saved, for the client to score and rank by day, week, month
    // and all time against the caller's spin day. Paged, since PostgREST caps
    // each response at 1000 rows.
    if (body.action === "leaderboard") {
      const pageSize = 1000;
      const spins: Array<{ user_id: string; spin_day: string; spin_number: string; created_at: string }> = [];
      for (let from = 0; ; from += pageSize) {
        const { data: page, error: pageError } = await database
          .from("frcdle_spins")
          .select("user_id, spin_day, spin_number, created_at")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (pageError) return jsonResponse({ error: "Could not load spins" }, 500);
        spins.push(...(page ?? []));
        if (!page || page.length < pageSize) break;
      }

      const userIds = [...new Set(spins.map((spin) => spin.user_id))];
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await database.from("profiles").select("id, name").in("id", userIds)
        : { data: [], error: null };
      if (profilesError) return jsonResponse({ error: "Could not load players" }, 500);
      const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.name as string | null]));

      return jsonResponse({
        spinDay,
        spins: spins.map((spin) => ({
          spin_number: spin.spin_number,
          spin_day: spin.spin_day,
          created_at: spin.created_at,
          name: nameById.get(spin.user_id) ?? null,
          is_you: spin.user_id === user.id,
        })),
      });
    }

    // Developer sandbox reset: clear today's roll so it can be spun again.
    if (body.action === "reset") {
      const { data: profile, error: profileError } = await database
        .from("profiles")
        .select("is_developer")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) return jsonResponse({ error: "Could not load profile" }, 500);
      if (!profile?.is_developer) return jsonResponse({ error: "Developer access required" }, 403);
      const { error: deleteError } = await database
        .from("frcdle_spins")
        .delete()
        .eq("user_id", user.id)
        .eq("spin_day", spinDay);
      if (deleteError) return jsonResponse({ error: "Could not reset today's spin" }, 500);
      return jsonResponse({ spin: null, timeZone: effectiveTimeZone, alreadySpun: false });
    }

    const findExisting = () => database
      .from("frcdle_spins")
      .select("spin_day, spin_number, created_at")
      .eq("user_id", user.id)
      .eq("spin_day", spinDay)
      .maybeSingle();

    const { data: existing, error: lookupError } = await findExisting();
    if (lookupError) return jsonResponse({ error: "Could not load today's spin" }, 500);
    if (existing) return jsonResponse({ spin: existing, timeZone: effectiveTimeZone, alreadySpun: true });
    if (body.action === "status") return jsonResponse({ spin: null, timeZone: effectiveTimeZone, alreadySpun: false });

    const spinNumber = randomSixDigitNumber();
    const { data: inserted, error: insertError } = await database
      .from("frcdle_spins")
      .insert({ user_id: user.id, spin_day: spinDay, spin_number: spinNumber, time_zone: effectiveTimeZone })
      .select("spin_day, spin_number, created_at")
      .single();

    if (!insertError && inserted) return jsonResponse({ spin: inserted, timeZone: effectiveTimeZone, alreadySpun: false });

    // A second tab may spin at the same time; the unique key guarantees only
    // one number is saved for this account and local spin day.
    const { data: raceWinner } = await findExisting();
    if (raceWinner) return jsonResponse({ spin: raceWinner, timeZone: effectiveTimeZone, alreadySpun: true });
    return jsonResponse({ error: "Could not save today's spin" }, 500);
  } catch (error) {
    console.error("frcdle-spin error:", error);
    return jsonResponse({ error: "Unexpected server error" }, 500);
  }
});