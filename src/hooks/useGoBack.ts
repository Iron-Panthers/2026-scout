import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Back to the page the user came from, or to `fallback` when this page was opened
 * directly (e.g. from a notification link), so Back never leaves the app.
 */
export function useGoBack(fallback = "/dashboard") {
  const navigate = useNavigate();
  return useCallback(() => {
    // React Router numbers its history entries; 0 is the first page of this visit.
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
