// Test Edge Function: Send a push notification to a specific user
//
// Usage:
// POST /functions/v1/test-push-notification
// Body: { "user_id": "uuid", "message": "optional custom message" }
//
// This is for TESTING ONLY - sends a notification immediately without checking matches

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Debug: Check environment variables
    console.log("Environment check:", {
      hasVapidSubject: !!VAPID_SUBJECT,
      hasVapidPublic: !!VAPID_PUBLIC_KEY,
      hasVapidPrivate: !!VAPID_PRIVATE_KEY,
    });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get request body
    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;
    const customMessage = body.message || "This is a test push notification from 2026 Scout!";

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "user_id is required in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    if (subError) {
      return new Response(
        JSON.stringify({ error: subError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No push subscriptions found for this user",
          hint: "Make sure the user has enabled notifications in Settings"
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send notification to all subscriptions
    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const payload = JSON.stringify({
          title: "🧪 Test Notification",
          body: customMessage,
          tag: `test-${Date.now()}`,
          url: "/dashboard",
        });

        await sendWebPush(sub, payload);
        sent++;
      } catch (err: any) {
        console.error(`Failed to send to ${sub.endpoint}:`, err.message);
        failed++;

        // Clean up invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        message: `Sent ${sent} notification(s) to user ${userId}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
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
  console.log("sendWebPush called with:", {
    endpoint: subscription.endpoint?.substring(0, 50) + "...",
    hasP256dh: !!subscription.p256dh,
    hasAuth: !!subscription.auth,
    payloadLength: payload.length,
  });

  console.log("Setting VAPID details...");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  console.log("Sending notification...");
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

  console.log("Notification sent successfully!");
}
