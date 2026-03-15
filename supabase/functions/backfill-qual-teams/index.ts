// Supabase Edge Function: Backfill team1/team2/team3 into qual_scouting_submissions
//
// Reads each qual submission's event_code, match_number, and role from scouting_data,
// fetches the correct team ordering from TBA, and patches scouting_data with team1/team2/team3.
//
// Environment secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically by Supabase)
//   TBA_AUTH_KEY - The Blue Alliance API key
//
// Deploy: supabase functions deploy backfill-qual-teams
// Run once: curl -X POST <function-url>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TBA_AUTH_KEY = Deno.env.get("TBA_AUTH_KEY")!;
const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

// Cache TBA match data to avoid redundant API calls
const matchCache = new Map<string, any>();

async function getTBAMatch(matchKey: string) {
  if (matchCache.has(matchKey)) return matchCache.get(matchKey);

  const res = await fetch(`${TBA_BASE_URL}/match/${matchKey}`, {
    headers: { "X-TBA-Auth-Key": TBA_AUTH_KEY },
  });

  if (!res.ok) {
    console.error(`TBA error for ${matchKey}: ${res.status}`);
    return null;
  }

  const data = await res.json();
  matchCache.set(matchKey, data);
  return data;
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all qual scouting submissions
    const { data: submissions, error } = await supabase
      .from("qual_scouting_submissions")
      .select("id, scouting_data");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!submissions || submissions.length === 0) {
      return new Response(JSON.stringify({ message: "No submissions found" }), { status: 200 });
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const sub of submissions) {
      const sd = sub.scouting_data;
      if (!sd) { skipped++; continue; }

      // Skip if already backfilled
      if (sd.team1 && sd.team2 && sd.team3) {
        skipped++;
        continue;
      }

      const eventCode = sd.event_code;
      const matchNumber = sd.match_number;
      const role = sd.role; // "qualRed" or "qualBlue"

      if (!eventCode || !matchNumber || !role) {
        console.error(`Missing data for submission ${sub.id}`);
        skipped++;
        continue;
      }

      const alliance = role === "qualRed" ? "red" : "blue";
      const matchKey = `${eventCode}_qm${matchNumber}`;

      try {
        const tbaMatch = await getTBAMatch(matchKey);
        if (!tbaMatch?.alliances?.[alliance]?.team_keys) {
          console.error(`No TBA data for ${matchKey} ${alliance}`);
          skipped++;
          continue;
        }

        const teamKeys = tbaMatch.alliances[alliance].team_keys;
        const team1 = parseInt(teamKeys[0]?.replace("frc", "") || "0");
        const team2 = parseInt(teamKeys[1]?.replace("frc", "") || "0");
        const team3 = parseInt(teamKeys[2]?.replace("frc", "") || "0");

        // Patch scouting_data with team1/team2/team3
        const updatedData = { ...sd, team1, team2, team3 };

        const { error: updateError } = await supabase
          .from("qual_scouting_submissions")
          .update({ scouting_data: updatedData })
          .eq("id", sub.id);

        if (updateError) {
          console.error(`Update error for ${sub.id}:`, updateError);
          errors++;
        } else {
          updated++;
        }
      } catch (err: any) {
        console.error(`Error processing ${sub.id}:`, err.message);
        errors++;
      }
    }

    const result = {
      message: `Backfill complete: updated ${updated}, skipped ${skipped}, errors ${errors}`,
      total: submissions.length,
    };
    console.log("backfill-qual-teams result:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
