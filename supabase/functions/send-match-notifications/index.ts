// Supabase Edge Function: Send push notifications for upcoming matches
//
// Environment secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (set automatically by Supabase)
//   TBA_AUTH_KEY       - The Blue Alliance API key
//   VAPID_SUBJECT      - e.g. "mailto:team@example.com"
//   VAPID_PUBLIC_KEY   - VAPID public key
//   VAPID_PRIVATE_KEY  - VAPID private key
//
// Deploy: supabase functions deploy send-match-notifications
// Set secrets: supabase secrets set TBA_AUTH_KEY=xxx VAPID_SUBJECT=xxx VAPID_PUBLIC_KEY=xxx VAPID_PRIVATE_KEY=xxx
//
// Trigger via cron (every 2 minutes during events):
//   SELECT cron.schedule('match-notifications', '*/2 * * * *', $$
//     SELECT net.http_post(
//       url := '<SUPABASE_URL>/functions/v1/send-match-notifications',
//       headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
//     );
//   $$);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TBA_AUTH_KEY = Deno.env.get("TBA_AUTH_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const NOTIFICATION_WINDOW_MINUTES = 5;

// Role column to display name and TBA alliance mapping
const ROLE_MAP: Record<
  string,
  { displayName: string; alliance: string; position: number }
> = {
  red1_scouter_id: { displayName: "Red 1", alliance: "red", position: 0 },
  red2_scouter_id: { displayName: "Red 2", alliance: "red", position: 1 },
  red3_scouter_id: { displayName: "Red 3", alliance: "red", position: 2 },
  qual_red_scouter_id: {
    displayName: "Qual Red",
    alliance: "red",
    position: -1,
  },
  blue1_scouter_id: { displayName: "Blue 1", alliance: "blue", position: 0 },
  blue2_scouter_id: { displayName: "Blue 2", alliance: "blue", position: 1 },
  blue3_scouter_id: { displayName: "Blue 3", alliance: "blue", position: 2 },
  qual_blue_scouter_id: {
    displayName: "Qual Blue",
    alliance: "blue",
    position: -1,
  },
};

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get active events
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("*")
      .eq("is_active", true);

    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), {
        status: 500,
      });
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active events" }),
        { status: 200 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const windowEnd = now + NOTIFICATION_WINDOW_MINUTES * 60;
    let notificationsSent = 0;

    for (const event of events) {
      if (!event.event_code) continue;

      // 2. Fetch match schedule from TBA
      const tbaResponse = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${event.event_code}/matches`,
        { headers: { "X-TBA-Auth-Key": TBA_AUTH_KEY } }
      );

      if (!tbaResponse.ok) continue;

      const tbaMatches = await tbaResponse.json();

      // 3. Find matches in the notification window
      const upcomingMatches = tbaMatches.filter((m: any) => {
        const matchTime = m.predicted_time || m.time;
        return (
          matchTime &&
          matchTime >= now &&
          matchTime <= windowEnd &&
          m.comp_level === "qm"
        );
      });

      if (upcomingMatches.length === 0) continue;

      // 4. Get our matches from DB for this event
      const { data: dbMatches } = await supabase
        .from("matches")
        .select("*")
        .eq("event_id", event.id);

      if (!dbMatches) continue;

      for (const tbaMatch of upcomingMatches) {
        const matchNumber = tbaMatch.match_number;
        const matchTime = tbaMatch.predicted_time || tbaMatch.time;
        const minutesUntil = Math.round((matchTime - now) / 60);

        const dbMatch = dbMatches.find(
          (m: any) => m.match_number === matchNumber
        );
        if (!dbMatch) continue;

        // 5. Check each scouter assignment
        for (const [column, info] of Object.entries(ROLE_MAP)) {
          const scouterId = dbMatch[column];
          if (!scouterId) continue;

          const notificationTag = `match-${event.event_code}-${matchNumber}-${column}`;

          // 6. Check dedup log
          const { data: existing } = await supabase
            .from("notification_log")
            .select("id")
            .eq("user_id", scouterId)
            .eq("notification_tag", notificationTag)
            .maybeSingle();

          if (existing) continue; // Already notified

          // Get team number from TBA data
          let teamInfo = "";
          if (info.position >= 0) {
            const teamKey =
              tbaMatch.alliances?.[info.alliance]?.team_keys?.[info.position];
            if (teamKey) {
              teamInfo = ` - Team ${teamKey.replace("frc", "")}`;
            }
          }

          // 7. Get push subscriptions for this scouter
          const { data: subscriptions } = await supabase
            .from("push_subscriptions")
            .select("*")
            .eq("user_id", scouterId);

          if (!subscriptions || subscriptions.length === 0) continue;

          const roleName = column.replace("_scouter_id", "");
          const payload = JSON.stringify({
            title: `Match ${matchNumber} in ${minutesUntil} min`,
            body: `You're scouting ${info.displayName}${teamInfo}`,
            tag: notificationTag,
            url: `/config/${dbMatch.id}?role=${roleName}`,
            matchId: dbMatch.id,
          });

          // 8. Send push to all subscriptions for this user
          for (const sub of subscriptions) {
            try {
              await sendWebPush(sub, payload);
              notificationsSent++;
            } catch (err: any) {
              console.error(
                `Push failed for ${sub.endpoint}:`,
                err.message || err
              );
              // If subscription is expired/invalid, clean it up
              if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase
                  .from("push_subscriptions")
                  .delete()
                  .eq("id", sub.id);
              }
            }
          }

          // 9. Log the notification to prevent duplicates
          await supabase.from("notification_log").insert({
            user_id: scouterId,
            notification_tag: notificationTag,
          });
        }
      }
    }

    // 10. Clean up old notification logs (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("notification_log")
      .delete()
      .lt("sent_at", oneDayAgo);

    return new Response(
      JSON.stringify({
        message: `Sent ${notificationsSent} notifications`,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});

/**
 * Send a web push notification.
 * Uses the web-push library via esm.sh for Deno compatibility.
 */
async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string
) {
  const webpush = await import("https://esm.sh/web-push@3.6.7");

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
