import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setupNavigationListener } from "@/lib/swRegistration";

/**
 * Component that listens for navigation messages from the service worker
 * (triggered by notification clicks) and handles in-app navigation.
 */
export default function NotificationNavigationListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = setupNavigationListener(navigate);
    return cleanup;
  }, [navigate]);

  return null;
}
