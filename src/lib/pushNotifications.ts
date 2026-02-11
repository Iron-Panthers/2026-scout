import { supabase } from "./supabase";
import { waitForRegistration } from "./swRegistration";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported(): boolean {
  return (
    "PushManager" in window &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

/**
 * Get current notification permission status.
 */
export function getPermissionStatus(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/**
 * Request notification permission and subscribe to push.
 * Throws errors instead of returning false for better error handling.
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  console.log("subscribeToPush called for user:", userId);

  if (!isPushSupported()) {
    console.error("Push not supported");
    throw new Error("Push notifications are not supported in this browser");
  }
  console.log("✓ Push is supported");

  // Wait for service worker to be ready
  console.log("Waiting for service worker registration...");
  const registration = await waitForRegistration();
  if (!registration) {
    console.error("Service worker registration failed");
    throw new Error("Service worker not ready. Please refresh and try again.");
  }
  console.log("✓ Service worker registered:", registration);

  // Request permission
  console.log("Requesting notification permission...");
  const permission = await Notification.requestPermission();
  console.log("Permission result:", permission);
  if (permission !== "granted") {
    throw new Error("Notification permission denied");
  }

  try {
    // Subscribe to push
    console.log("Creating push subscription with VAPID key...");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    console.log("✓ Push subscription created:", subscription.endpoint.substring(0, 50) + "...");

    const subscriptionJson = subscription.toJSON();
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!p256dh || !auth) {
      console.error("Missing subscription keys");
      throw new Error("Missing subscription keys");
    }
    console.log("✓ Subscription keys extracted");

    // Save to database
    console.log("Saving subscription to database...");
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      },
      { onConflict: "user_id,endpoint" }
    );

    if (error) {
      console.error("Database error:", error);
      // If insert fails due to duplicate, that's actually OK (23505 = unique violation)
      if (error.code !== "23505") {
        throw new Error("Failed to save subscription to database");
      }
      console.log("✓ Subscription already exists (duplicate)");
    } else {
      console.log("✓ Subscription saved to database");
    }

    return true;
  } catch (error: any) {
    console.error("subscribeToPush failed:", error);
    // Re-throw with better message if it's not already our error
    if (error.message?.includes("Service worker") ||
        error.message?.includes("permission") ||
        error.message?.includes("subscription")) {
      throw error;
    }
    throw new Error("Failed to subscribe to push notifications");
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  const registration = await waitForRegistration();
  if (!registration) return false;

  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();

      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint);
    }
    return true;
  } catch (error) {
    console.error("Error unsubscribing from push:", error);
    return false;
  }
}

/**
 * Check if the user currently has an active push subscription.
 * Waits for service worker to be ready before checking.
 */
export async function isSubscribed(): Promise<boolean> {
  const registration = await waitForRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
