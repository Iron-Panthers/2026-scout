import { useMatchAssignmentNotifications } from "@/hooks/useMatchAssignmentNotifications";

/**
 * Component that listens for match assignment notifications.
 * Add this to App.tsx to enable real-time notifications when users are assigned to matches.
 */
export default function MatchAssignmentListener() {
  useMatchAssignmentNotifications();
  return null; // This component doesn't render anything
}
