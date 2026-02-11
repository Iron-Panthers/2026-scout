import { useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface MatchAssignmentNotification {
  id: string;
  user_id: string;
  match_id: string;
  role: string;
  created_at: string;
  notified: boolean;
}

/**
 * Hook that listens for match assignment notifications in real-time
 * and displays toasts + sends push notifications when assigned to a new match.
 */
export function useMatchAssignmentNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();

  const sendPushNotification = useCallback(
    async (matchId: string, role: string) => {
      // Get match details
      const { data: match } = await supabase
        .from("matches")
        .select("match_number, event_id, events(name)")
        .eq("id", matchId)
        .single();

      if (!match) return;

      // Format role name
      const roleDisplay = role
        .replace("_scouter_id", "")
        .replace("qual_red", "Qual Red")
        .replace("qual_blue", "Qual Blue")
        .replace("red", "Red ")
        .replace("blue", "Blue ");

      const eventName = (match.events as any)?.name || "Event";
      const title = `New Match Assignment`;
      const body = `You've been assigned to ${eventName} - Match ${match.match_number} (${roleDisplay})`;

      // Send via service worker
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, {
            body,
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png",
            tag: `match-assignment-${matchId}`,
            data: {
              url: `/config/${matchId}?role=${role.replace("_scouter_id", "")}`,
              matchId,
            },
            requireInteraction: false,
          });
        }
      }

      // Also show toast in app
      toast({
        title: "🎯 " + title,
        description: body,
        duration: 10000,
      });
    },
    [toast]
  );

  const markAsNotified = useCallback(async (notificationId: string) => {
    const { error } = await supabase
      .from("match_assignment_notifications")
      .update({ notified: true, notified_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (error) {
      console.error("Failed to mark notification as notified:", error);
    } else {
      console.log("✅ Marked notification as notified:", notificationId);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // Check for any unnotified assignments on mount
    const checkUnnotified = async () => {
      const { data } = await supabase
        .from("match_assignment_notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("notified", false)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        // Notify for each unnotified assignment
        for (const notification of data) {
          await sendPushNotification(notification.match_id, notification.role);
          await markAsNotified(notification.id);
        }
      }
    };

    checkUnnotified();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("match-assignments")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_assignment_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as MatchAssignmentNotification;

          // Send notification
          await sendPushNotification(notification.match_id, notification.role);

          // Mark as notified
          await markAsNotified(notification.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, sendPushNotification, markAsNotified]);
}
