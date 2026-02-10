import { supabase } from "./supabase";
import { getRegistration } from "./swRegistration";

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
 */
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) {
    console.warn("Push notifications not supported");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }

  const registration = getRegistration();
  if (!registration) {
    console.error("No service worker registration");
    return false;
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });

    const subscriptionJson = subscription.toJSON();
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!p256dh || !auth) {
      console.error("Missing subscription keys");
      return false;
    }

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
      console.error("Error storing push subscription:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error subscribing to push:", error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  const registration = getRegistration();
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
 */
export async function isSubscribed(): Promise<boolean> {
  const registration = getRegistration();
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
