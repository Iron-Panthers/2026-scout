// Supabase Edge Function: Send push notification when a scout is assigned or removed from a match
//
// Called from a database trigger via pg_net when the matches table is updated.
//
// Request body (sent by DB trigger):
// {
//   "type": "assigned" | "removed",
//   "userId": "uuid",
//   "matchId": "uuid",
//   "matchNumber": 42,
//   "eventId": "uuid" | null,
//   "role": "red1_scouter_id"
// }
//
// Deploy: supabase functions deploy send-match-assignment-notification
// Secrets required: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const ROLE_DISPLAY: Record<string, string> = {
  red1_scouter_id: "Red 1",
  red2_scouter_id: "Red 2",
  red3_scouter_id: "Red 3",
  qual_red_scouter_id: "Qual Red",
  blue1_scouter_id: "Blue 1",
  blue2_scouter_id: "Blue 2",
  blue3_scouter_id: "Blue 3",
  qual_blue_scouter_id: "Qual Blue",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { type, userId, matchId, matchNumber, eventId, role } =
      await req.json();

    if (!type || !userId || !matchId || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Resolve event name if we have an event_id
    let eventName = "Event";
    if (eventId) {
      const { data: event } = await supabase
        .from("events")
        .select("name")
        .eq("id", eventId)
        .single();
      if (event) eventName = event.name;
    }

    const roleDisplay = ROLE_DISPLAY[role] ?? role.replace("_scouter_id", "");
    const roleName = role.replace("_scouter_id", "");

    let title: string;
    let body: string;
    let tag: string;
    let url: string;

    if (type === "assigned") {
      title = "New Match Assignment";
      body = `You've been assigned to ${eventName} - Match ${matchNumber} (${roleDisplay})`;
      tag = `assignment-${matchId}-${role}`;
      url = `/config/${matchId}?role=${roleName}`;
    } else {
      // type === "removed"
      title = `Unassigned from Match ${matchNumber}`;
      body = `You've been removed from ${roleDisplay} at ${eventName}`;
      tag = `unassignment-${matchId}-${role}-${Date.now()}`;
      url = "/dashboard";
    }

    // Get push subscriptions for this user
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No subscriptions found for user" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({ title, body, tag, url });

    let sentCount = 0;
    for (const sub of subscriptions) {
      try {
        await sendWebPush(sub, payload);
        sentCount++;
      } catch (err: any) {
        console.error(`Push failed for ${sub.endpoint}:`, err.message || err);
        // Clean up expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sentCount} notifications` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
