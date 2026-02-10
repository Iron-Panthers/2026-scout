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

  const toggleNotifications = useCallback(
    async (enabled: boolean) => {
      if (!user?.id || !supported) return false;

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
    toggleNotifications,
  };
}
