// Supabase Edge Function: Send forced push notifications to all scouts in selected matches
//
// Called from the Manager Dashboard when the manager clicks "Send Notification"
// on selected matches.
//
// Request body:
// {
//   "matchIds": ["uuid1", "uuid2", ...]
// }
//
// Deploy: supabase functions deploy send-forced-notifications
// Secrets required: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLE_COLUMNS = [
  { column: "red1_scouter_id", display: "Red 1", role: "red1" },
  { column: "red2_scouter_id", display: "Red 2", role: "red2" },
  { column: "red3_scouter_id", display: "Red 3", role: "red3" },
  { column: "qual_red_scouter_id", display: "Qual Red", role: "qualRed" },
  { column: "blue1_scouter_id", display: "Blue 1", role: "blue1" },
  { column: "blue2_scouter_id", display: "Blue 2", role: "blue2" },
  { column: "blue3_scouter_id", display: "Blue 3", role: "blue3" },
  { column: "qual_blue_scouter_id", display: "Qual Blue", role: "qualBlue" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { matchIds } = body as { matchIds: string[] };

    if (!matchIds || matchIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "matchIds is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch matches with their scouter assignments
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id, match_number, " + ROLE_COLUMNS.map((r) => r.column).join(", "))
      .in("id", matchIds);

    if (matchesError) {
      return new Response(
        JSON.stringify({ error: matchesError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ message: "No matches found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;

    for (const match of matches) {
      for (const { column, display, role } of ROLE_COLUMNS) {
        const scouterId = match[column];
        if (!scouterId) continue;

        // Get push subscriptions for this scout
        const { data: subscriptions } = await supabase
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", scouterId);

        if (!subscriptions || subscriptions.length === 0) continue;

        const payload = JSON.stringify({
          title: `Match ${match.match_number} — Head to your position!`,
          body: `You're scouting ${display}. Get ready now!`,
          tag: `forced-${match.id}-${column}-${Date.now()}`,
          url: `/config/${match.id}?role=${role}`,
        });

        for (const sub of subscriptions) {
          try {
            await sendWebPush(sub, payload);
            totalSent++;
          } catch (err: any) {
            console.error(`Push failed for ${sub.endpoint}:`, err.message || err);
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${totalSent} notifications` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    payload
  );
}
