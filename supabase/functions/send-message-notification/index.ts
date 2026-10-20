// Supabase Edge Function: push notifications for direct messages and Bug Reporting
//
// Called from database triggers via pg_net. Request body, one of:
//
//   A direct message (on_message_sent trigger):
//   { "messageId": "uuid", "senderId": "uuid", "recipientId": "uuid", "body": "first 200 chars" }
//
//   Bug Reporting (on_bug_report_* triggers):
//   { "kind": "bug_report" | "bug_comment" | "bug_fixed", "reportId": "uuid", "actorId": "uuid", "body": "..." }
//     bug_report  → every developer
//     bug_comment → the report's author, everyone who commented on it, and every developer
//     bug_fixed   → the report's author
//
// Only users who turned on Settings → Notifications → Messages are notified, and never
// the person who caused the notification.
//
// Deploy: supabase functions deploy send-message-notification
// Secrets required: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase)

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Notification {
  /** Who might get it, before the opt-in and "not the actor" filters. */
  candidates: string[];
  actorId: string;
  title: string;
  body: string;
  /** One notification per conversation/report; a newer one replaces the older. */
  tag: string;
  url: string;
}

async function nameOf(supabase: SupabaseClient, id: string | null): Promise<string> {
  if (!id) return "Someone";
  const { data } = await supabase.from("profiles").select("name").eq("id", id).single();
  return data?.name || "Someone";
}

async function developerIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("profiles").select("id").eq("is_developer", true);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/** Works out who to notify, and with what, for a trigger's request. */
async function buildNotification(supabase: SupabaseClient, request: Record<string, any>): Promise<Notification | null> {
  const { kind, body } = request;

  if (!kind) {
    const { senderId, recipientId } = request;
    if (!senderId || !recipientId) return null;
    return {
      candidates: [recipientId],
      actorId: senderId,
      title: await nameOf(supabase, senderId),
      body: body || "Sent you a message",
      tag: `message-${senderId}`,
      url: `/messages?with=${senderId}`,
    };
  }

  const { reportId, actorId } = request;
  if (!reportId) return null;
  const { data: report } = await supabase.from("bug_reports").select("title, author_id").eq("id", reportId).single();
  if (!report) return null;
  const actorName = await nameOf(supabase, actorId);
  const common = { actorId, tag: `bug-${reportId}`, url: `/bug-reports?report=${reportId}` };

  if (kind === "bug_report") {
    return { ...common, candidates: await developerIds(supabase), title: `New bug report from ${actorName}`, body: report.title };
  }
  if (kind === "bug_comment") {
    const { data: commenters } = await supabase.from("bug_report_comments").select("author_id").eq("report_id", reportId);
    const candidates = [
      report.author_id,
      ...(commenters ?? []).map((row: { author_id: string }) => row.author_id),
      ...(await developerIds(supabase)),
    ];
    return { ...common, candidates, title: `${actorName} commented on "${report.title}"`, body: body || "New comment" };
  }
  if (kind === "bug_fixed") {
    return { ...common, candidates: [report.author_id], title: "Your bug report was marked fixed", body: report.title };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const notification = await buildNotification(supabase, await req.json());
    if (!notification) return json({ error: "Missing or invalid fields" }, 400);

    // Opted in, and not the person who caused it
    const candidates = [...new Set(notification.candidates)].filter((id) => id && id !== notification.actorId);
    if (candidates.length === 0) return json({ message: "No one to notify" });
    const { data: optedIn } = await supabase
      .from("profiles")
      .select("id")
      .in("id", candidates)
      .eq("message_notifications", true);
    const recipientIds = (optedIn ?? []).map((row: { id: string }) => row.id);
    if (recipientIds.length === 0) return json({ message: "No one opted in" });

    const { data: subscriptions } = await supabase.from("push_subscriptions").select("*").in("user_id", recipientIds);
    if (!subscriptions || subscriptions.length === 0) return json({ message: "No subscriptions found" });

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      url: notification.url,
      // The app shows its own in-app notification when it's open and focused
      skipIfFocused: true,
    });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    let sentCount = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sentCount++;
      } catch (err: any) {
        console.error(`Push failed for ${sub.endpoint}:`, err.message || err);
        // Clean up expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return json({ message: `Sent ${sentCount} notifications` });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return json({ error: err.message }, 500);
  }
});
