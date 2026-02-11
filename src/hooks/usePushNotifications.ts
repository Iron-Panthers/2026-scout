import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed as checkIsSubscribed,
  getPermissionStatus,
} from "@/lib/pushNotifications";

export function usePushNotifications() {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    getPermissionStatus()
  );
  const supported = isPushSupported();

  // Check subscription status on mount
  useEffect(() => {
    if (supported) {
      checkIsSubscribed().then(setSubscribed);
    }
  }, [supported]);

  // Monitor permission changes (poll every 2 seconds)
  useEffect(() => {
    if (!supported) return;

    // Update permission immediately
    setPermission(getPermissionStatus());

    // Poll permission every 2 seconds (browsers don't provide permission change events)
    const interval = setInterval(() => {
      setPermission(getPermissionStatus());
    }, 2000);

    return () => clearInterval(interval);
  }, [supported]);

  const toggleNotifications = useCallback(
    async (enabled: boolean) => {
      setError(null);

      if (!user?.id) {
        setError("You must be logged in to enable notifications");
        return false;
      }

      if (!supported) {
        setError("Push notifications are not supported in this browser");
        return false;
      }

      setLoading(true);
      try {
        if (enabled) {
          const success = await subscribeToPush(user.id);
          setSubscribed(success);
          setPermission(getPermissionStatus());
          return success;
        } else {
          await unsubscribeFromPush(user.id);
          setSubscribed(false);
          return true;
        }
      } catch (err: any) {
        console.error("Toggle notifications error:", err);

        // Set user-friendly error message
        if (err.message?.includes("permission denied")) {
          setError("Notification permission denied. Please enable in browser settings.");
        } else if (err.message?.includes("Service worker")) {
          setError("Service worker not ready. Please refresh and try again.");
        } else if (err.message?.includes("not supported")) {
          setError("Push notifications are not supported in this browser");
        } else {
          setError(err.message || "Failed to toggle notifications. Please try again.");
        }

        return false;
      } finally {
        setLoading(false);
      }
    },
    [user?.id, supported]
  );

  return {
    supported,
    subscribed,
    loading,
    permission,
    error,
    toggleNotifications,
  };
}
