import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getBugReports,
  getLocalSeenBugReports,
  getStoredSeenBugReports,
  laterTime,
  markBugReportSeen,
  mergeSeen,
  type BugReportWithCount,
  type SeenBugReports,
} from "@/lib/bugReports";

/**
 * Every bug report, kept live, plus which ones have activity this user hasn't seen
 * (by when they last opened each report: stored in the database, with this browser's copy
 * filling in while that loads or when it can't be reached).
 */
export function useBugReports(userId: string | null) {
  const [reports, setReports] = useState<BugReportWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [seenState, setSeenState] = useState(() => ({ userId, seen: userId ? getLocalSeenBugReports(userId) : {} }));
  // The user is often still loading on the first render (e.g. after a reload), so read
  // their seen reports again once they're known rather than treating everything as new.
  if (seenState.userId !== userId) setSeenState({ userId, seen: userId ? getLocalSeenBugReports(userId) : {} });
  const seen = seenState.seen;
  // The database's markers, once loaded (null until then, or if they couldn't be)
  const [storedSeen, setStoredSeen] = useState<{ userId: string; seen: SeenBugReports } | null>(null);

  const reload = useCallback(async () => {
    setReports(await getBugReports());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getBugReports().then((list) => {
      if (cancelled) return;
      setReports(list);
      setLoading(false);
    });
    getStoredSeenBugReports(userId).then((stored) => {
      if (cancelled || !stored) return;
      setStoredSeen({ userId, seen: stored });
      setSeenState((prev) => prev.userId === userId ? { userId, seen: mergeSeen(prev.seen, stored) } : prev);
    });
    const channel = supabase
      .channel(`bug-reports-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bug_reports" }, () => {
        getBugReports().then((list) => !cancelled && setReports(list));
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markSeen = useCallback(
    (reportId: string) => {
      if (!userId) return;
      const seenNow = (at: string) =>
        setSeenState((prev) => prev.userId === userId
          ? { userId, seen: { ...prev.seen, [reportId]: laterTime(prev.seen[reportId], at)! } }
          : prev);
      seenNow(new Date().toISOString());
      void markBugReportSeen(userId, reportId).then(seenNow);
    },
    [userId]
  );

  // Markers only this browser has (from before they were stored), for reports with nothing
  // new since: store them, once, so they hold on other devices and deploy addresses too.
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !storedSeen || storedSeen.userId !== userId || loading || syncedRef.current === userId) return;
    syncedRef.current = userId;
    const local = getLocalSeenBugReports(userId);
    for (const report of reports) {
      const localAt = local[report.id];
      if (!localAt || storedSeen.seen[report.id]) continue;
      if (Date.parse(localAt) >= Date.parse(report.updated_at)) void markBugReportSeen(userId, report.id);
    }
  }, [userId, storedSeen, loading, reports]);

  /**
   * New to this user: a report they filed or commented on that has had activity since they
   * last looked. A fixed report never counts — there's nothing left to follow up on — and
   * neither does anyone else's report they haven't joined in on.
   */
  const isNew = useCallback(
    (report: BugReportWithCount) => {
      if (report.status === "fixed" || !userId) return false;
      if (report.author_id !== userId && !report.commenterIds.includes(userId)) return false;
      const lastSeen = seen[report.id];
      // No marker anywhere (they joined in before markers were stored): new if anyone else
      // has commented on it
      if (!lastSeen) return report.commenterIds.some((id) => id !== userId);
      return Date.parse(report.updated_at) > Date.parse(lastSeen);
    },
    [seen, userId]
  );

  const newCount = useMemo(() => reports.filter(isNew).length, [reports, isNew]);
  const openCount = useMemo(() => reports.filter((report) => report.status === "open").length, [reports]);

  return { reports, loading, reload, isNew, markSeen, newCount, openCount };
}
