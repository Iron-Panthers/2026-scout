import { supabase } from "@/lib/supabase";

export type BugReportStatus = "open" | "fixed";

export interface BugReport {
  id: string;
  author_id: string;
  title: string;
  description: string;
  status: BugReportStatus;
  fixed_by: string | null;
  fixed_at: string | null;
  created_at: string;
  /** Last activity: a new comment or a status change. */
  updated_at: string;
}

export interface BugReportWithCount extends BugReport {
  commentCount: number;
}

export interface BugReportComment {
  id: string;
  report_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export const MAX_BUG_TITLE_LENGTH = 120;
export const MAX_BUG_DESCRIPTION_LENGTH = 4000;
export const MAX_BUG_COMMENT_LENGTH = 2000;

/** Messages-page key for the Bug Reporting inbox, and for one report in it ("bug:<id>"). */
export const BUG_INBOX_KEY = "bug";
export const bugReportKey = (reportId: string) => `${BUG_INBOX_KEY}:${reportId}`;
export function bugReportIdFromKey(key: string | null): string | null {
  return key?.startsWith(`${BUG_INBOX_KEY}:`) ? key.slice(BUG_INBOX_KEY.length + 1) : null;
}

/** Every bug report, most recent activity first, with how many comments each has. */
export async function getBugReports(): Promise<BugReportWithCount[]> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*, bug_report_comments(count)")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("Error loading bug reports:", error);
    return [];
  }
  return (data ?? []).map(({ bug_report_comments, ...report }) => ({
    ...(report as BugReport),
    commentCount: (bug_report_comments as Array<{ count: number }> | null)?.[0]?.count ?? 0,
  }));
}

export async function getBugReportComments(reportId: string): Promise<BugReportComment[]> {
  const { data, error } = await supabase
    .from("bug_report_comments")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error loading bug report comments:", error);
    return [];
  }
  return (data ?? []) as BugReportComment[];
}

export async function createBugReport(authorId: string, title: string, description: string): Promise<BugReport | null> {
  const { data, error } = await supabase
    .from("bug_reports")
    .insert({ author_id: authorId, title: title.trim(), description: description.trim() })
    .select()
    .single();
  if (error) {
    console.error("Error filing bug report:", error);
    return null;
  }
  return data as BugReport;
}

export async function addBugReportComment(reportId: string, authorId: string, body: string): Promise<BugReportComment | null> {
  const { data, error } = await supabase
    .from("bug_report_comments")
    .insert({ report_id: reportId, author_id: authorId, body: body.trim() })
    .select()
    .single();
  if (error) {
    console.error("Error adding comment:", error);
    return null;
  }
  return data as BugReportComment;
}

/** Developers only: mark a report fixed (or reopen it). */
export async function setBugReportFixed(reportId: string, fixed: boolean): Promise<boolean> {
  const { error } = await supabase.rpc("set_bug_report_status", { p_report: reportId, p_fixed: fixed });
  if (error) {
    console.error("Error changing bug report status:", error);
    return false;
  }
  return true;
}

/** Developers only: deletes a report and every comment under it. */
export async function deleteBugReport(reportId: string): Promise<boolean> {
  const { error, count } = await supabase.from("bug_reports").delete({ count: "exact" }).eq("id", reportId);
  if (error || count === 0) {
    // count 0: the database's rules didn't allow it (not a developer)
    console.error("Error deleting bug report:", error ?? "not allowed");
    return false;
  }
  return true;
}

/** Whether the user wrote this report or has commented on it. */
export async function isBugReportParticipant(reportId: string, userId: string): Promise<boolean> {
  const [report, comments] = await Promise.all([
    supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("id", reportId).eq("author_id", userId),
    supabase.from("bug_report_comments").select("id", { count: "exact", head: true }).eq("report_id", reportId).eq("author_id", userId),
  ]);
  return (report.count ?? 0) > 0 || (comments.count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// "New activity" markers: when each report was last opened, kept in this browser
// ---------------------------------------------------------------------------

const seenKey = (userId: string) => `bug-reports-seen-${userId}`;

export function getSeenBugReports(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) || "{}");
  } catch {
    return {};
  }
}

export function markBugReportSeen(userId: string, reportId: string, at: string = new Date().toISOString()) {
  try {
    const seen = getSeenBugReports(userId);
    seen[reportId] = at;
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* storage blocked: markers just won't persist */
  }
}
