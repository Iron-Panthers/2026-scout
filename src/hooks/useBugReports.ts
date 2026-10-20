import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  getBugReports,
  getSeenBugReports,
  markBugReportSeen,
  type BugReportWithCount,
} from "@/lib/bugReports";

/**
 * Every bug report, kept live, plus which ones have activity this user hasn't seen
 * (by when they last opened each report, remembered in this browser).
 */
export function useBugReports(userId: string | null) {
  const [reports, setReports] = useState<BugReportWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [seen, setSeen] = useState<Record<string, string>>(() => (userId ? getSeenBugReports(userId) : {}));

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
      markBugReportSeen(userId, reportId);
      setSeen(getSeenBugReports(userId));
    },
    [userId]
  );

  /** New to this user: never opened (and someone else's), or active since they last looked. */
  const isNew = useCallback(
    (report: BugReportWithCount) => {
      const lastSeen = seen[report.id];
      if (!lastSeen) return report.author_id !== userId;
      return report.updated_at > lastSeen;
    },
    [seen, userId]
  );

  const newCount = useMemo(() => reports.filter(isNew).length, [reports, isNew]);
  const openCount = useMemo(() => reports.filter((report) => report.status === "open").length, [reports]);

  return { reports, loading, reload, isNew, markSeen, newCount, openCount };
}
