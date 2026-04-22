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
const ROLE_TO_TBA: Record<string, { alliance: "red" | "blue"; field: string[] }> = {
  red1:  { alliance: "red",  field: [ "endGameTowerRobot1", "autoTowerRobot1" ] },
  red2:  { alliance: "red",  field: [ "endGameTowerRobot2", "autoTowerRobot2" ] },
  red3:  { alliance: "red",  field: [ "endGameTowerRobot3", "autoTowerRobot3" ] },
  blue1: { alliance: "blue", field: [ "endGameTowerRobot1", "autoTowerRobot1" ] },
  blue2: { alliance: "blue", field: [ "endGameTowerRobot2", "autoTowerRobot2" ] },
  blue3: { alliance: "blue", field: [ "endGameTowerRobot3", "autoTowerRobot3" ] },
};

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Single query: get submissions missing tba_data with match/event info via joins
    const { data: submissions, error: subsError } = await supabase
      .from("scouting_submissions")
      .select("id, role, match_id, matches!inner(match_number, event_id, events!inner(event_code))")
      .is("tba_data", null)
      .in("role", ["red1", "red2", "red3", "blue1", "blue2", "blue3"]);

    if (subsError) {
      console.error("Submissions query error:", subsError);
      return new Response(JSON.stringify({ error: subsError.message }), { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return new Response(JSON.stringify({ message: "No submissions to update" }), { status: 200 });
    }

    // Group submissions by TBA match key to minimize API calls
    const matchGroups = new Map<string, {
      submissions: Array<{ id: string; role: string }>;
    }>();

    for (const sub of submissions) {
      const match = sub.matches as any;
      const eventCode = match?.events?.event_code;
      const matchNumber = match?.match_number;

      if (!eventCode || !matchNumber) continue;

      const matchKey = `${eventCode}_qm${matchNumber}`;
      if (!matchGroups.has(matchKey)) {
        matchGroups.set(matchKey, { submissions: [] });
      }
      matchGroups.get(matchKey)!.submissions.push({ id: sub.id, role: sub.role });
    }

    // Fetch TBA data for each unique match and update submissions
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

          const climbEndgameValue = scoreBreakdown[mapping.alliance]?.[mapping.field[0]];
          const climbAutoValue = scoreBreakdown[mapping.alliance]?.[mapping.field[1]];
          const tbaData = { endgameClimb: climbEndgameValue ?? "Unknown", autoClimb: climbAutoValue ?? "Unknown" };

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
