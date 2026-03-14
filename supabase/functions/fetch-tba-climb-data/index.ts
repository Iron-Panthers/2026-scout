// Supabase Edge Function: Fetch TBA climb data for scouting submissions
//
// Environment secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically by Supabase)
//   TBA_AUTH_KEY - The Blue Alliance API key
//
// Deploy: supabase functions deploy fetch-tba-climb-data
//
// Triggered via pg_cron every 20 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TBA_AUTH_KEY = Deno.env.get("TBA_AUTH_KEY")!;

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

// Role → TBA score_breakdown field mapping
const ROLE_TO_TBA: Record<string, { alliance: "red" | "blue"; field: string }> = {
  red1:  { alliance: "red",  field: "endGameTowerRobot1" },
  red2:  { alliance: "red",  field: "endGameTowerRobot2" },
  red3:  { alliance: "red",  field: "endGameTowerRobot3" },
  blue1: { alliance: "blue", field: "endGameTowerRobot1" },
  blue2: { alliance: "blue", field: "endGameTowerRobot2" },
  blue3: { alliance: "blue", field: "endGameTowerRobot3" },
};

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Get active events
    const { data: activeEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, event_code")
      .eq("is_active", true);

    if (eventsError) {
      console.error("Events query error:", eventsError);
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 });
    }

    if (!activeEvents || activeEvents.length === 0) {
      return new Response(JSON.stringify({ message: "No active events" }), { status: 200 });
    }

    const activeEventIds = activeEvents.map((e: any) => e.id);
    // Build event_id → event_code lookup
    const eventCodeMap = new Map<string, string>();
    for (const e of activeEvents) {
      if (e.event_code) eventCodeMap.set(e.id, e.event_code);
    }

    // Step 2: Get matches for active events
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id, match_number, event_id")
      .in("event_id", activeEventIds);

    if (matchesError) {
      console.error("Matches query error:", matchesError);
      return new Response(JSON.stringify({ error: matchesError.message }), { status: 500 });
    }

    if (!matches || matches.length === 0) {
      return new Response(JSON.stringify({ message: "No matches for active events" }), { status: 200 });
    }

    const matchIds = matches.map((m: any) => m.id);
    // Build match_id → { match_number, event_id } lookup
    const matchInfoMap = new Map<string, { matchNumber: number; eventId: string }>();
    for (const m of matches) {
      matchInfoMap.set(m.id, { matchNumber: m.match_number, eventId: m.event_id });
    }

    // Step 3: Get submissions missing tba_data, excluding qual roles
    const { data: submissions, error: subsError } = await supabase
      .from("scouting_submissions")
      .select("id, role, match_id")
      .is("tba_data", null)
      .in("role", ["red1", "red2", "red3", "blue1", "blue2", "blue3"])
      .in("match_id", matchIds);

    if (subsError) {
      console.error("Submissions query error:", subsError);
      return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return new Response(JSON.stringify({ message: "No submissions to update" }), { status: 200 });
    }

    // Step 4: Group submissions by TBA match key
    const matchGroups = new Map<string, {
      submissions: Array<{ id: string; role: string }>;
    }>();

    for (const sub of submissions) {
      const matchInfo = matchInfoMap.get(sub.match_id);
      if (!matchInfo) continue;

      const eventCode = eventCodeMap.get(matchInfo.eventId);
      if (!eventCode) continue;

      const matchKey = `${eventCode}_qm${matchInfo.matchNumber}`;
      if (!matchGroups.has(matchKey)) {
        matchGroups.set(matchKey, { submissions: [] });
      }
      matchGroups.get(matchKey)!.submissions.push({ id: sub.id, role: sub.role });
    }

    // Step 5: Fetch TBA data for each unique match and update submissions
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const [matchKey, group] of matchGroups) {
      try {
        const tbaRes = await fetch(`${TBA_BASE_URL}/match/${matchKey}`, {
          headers: { "X-TBA-Auth-Key": TBA_AUTH_KEY },
        });

        if (tbaRes.status === 404) {
          // Match not yet played — skip, will retry next run
          skipped += group.submissions.length;
          continue;
        }

        if (!tbaRes.ok) {
          console.error(`TBA error for ${matchKey}: ${tbaRes.status}`);
          errors += group.submissions.length;
          continue;
        }

        const tbaMatch = await tbaRes.json();
        const scoreBreakdown = tbaMatch.score_breakdown;

        if (!scoreBreakdown) {
          // Score breakdown not yet available
          skipped += group.submissions.length;
          continue;
        }

        // Update each submission in this match group
        for (const sub of group.submissions) {
          const mapping = ROLE_TO_TBA[sub.role];
          if (!mapping) {
            skipped++;
            continue;
          }

          const climbValue = scoreBreakdown[mapping.alliance]?.[mapping.field];
          const tbaData = { climb: climbValue ?? "Unknown" };

          const { error: updateError } = await supabase
            .from("scouting_submissions")
            .update({ tba_data: tbaData })
            .eq("id", sub.id);

          if (updateError) {
            console.error(`Update error for ${sub.id}:`, updateError);
            errors++;
          } else {
            updated++;
          }
        }
      } catch (err: any) {
        console.error(`Error processing ${matchKey}:`, err.message);
        errors += group.submissions.length;
      }
    }

    const result = {
      message: `Updated ${updated}, skipped ${skipped}, errors ${errors}`,
      matchesQueried: matchGroups.size,
      submissionsProcessed: submissions.length,
    };
    console.log("fetch-tba-climb-data result:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
