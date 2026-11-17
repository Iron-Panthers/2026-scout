import { supabase } from "@/lib/supabase";

export type BugReportStatus = "open" | "fixed";

export interface BugReport {
  id: string;
  /** Null once the author has deleted their account. */
  author_id: string | null;
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
  /** Everyone who has commented on it (each once). */
  commenterIds: string[];
}

export interface BugReportComment {
  id: string;
  report_id: string;
  /** Null once the author has deleted their account. */
  author_id: string | null;
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

/** Every bug report, most recent activity first, with how many comments each has and who wrote them. */
export async function getBugReports(): Promise<BugReportWithCount[]> {
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*, bug_report_comments(count), commenters:bug_report_comments(author_id)")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("Error loading bug reports:", error);
    return [];
  }
  return (data ?? []).map(({ bug_report_comments, commenters, ...report }) => ({
    ...(report as BugReport),
    commentCount: (bug_report_comments as Array<{ count: number }> | null)?.[0]?.count ?? 0,
    commenterIds: [...new Set(((commenters as Array<{ author_id: string | null }> | null) ?? [])
      .flatMap((c) => c.author_id ? [c.author_id] : []))],
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

/** Developers only: deletes a report and every comment under it. Returns why it couldn't, or null. */
export async function deleteBugReport(reportId: string): Promise<string | null> {
  const { error } = await supabase.rpc("delete_bug_report", { p_report: reportId });
  if (error) {
    console.error("Error deleting bug report:", error);
    return error.message;
  }
  return null;
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
// "New activity" markers: when each user last opened each report. Kept in the database
// (bug_report_views, stamped with the server's clock) so they survive a new deploy address
// or another device; this browser's localStorage copy covers being offline and older markers.
// ---------------------------------------------------------------------------

/** Report id → when it was last seen (ISO timestamp). */
export type SeenBugReports = Record<string, string>;

const seenKey = (userId: string) => `bug-reports-seen-${userId}`;

/** The later of two timestamps (either may be missing); compared as times, not text. */
export function laterTime(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/** Each report's latest seen time across several sets of markers. */
export function mergeSeen(...sets: SeenBugReports[]): SeenBugReports {
  const merged: SeenBugReports = {};
  for (const set of sets) {
    for (const [reportId, at] of Object.entries(set)) merged[reportId] = laterTime(merged[reportId], at)!;
  }
  return merged;
}

/** This browser's markers. */
export function getLocalSeenBugReports(userId: string): SeenBugReports {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) || "{}");
  } catch {
    return {};
  }
}

function setLocalSeen(userId: string, reportId: string, at: string) {
  try {
    const seen = getLocalSeenBugReports(userId);
    seen[reportId] = laterTime(seen[reportId], at)!;
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* storage blocked: the database copy still has it */
  }
}

/** The user's markers from the database; null if they couldn't be loaded. */
export async function getStoredSeenBugReports(userId: string): Promise<SeenBugReports | null> {
  const { data, error } = await supabase
    .from("bug_report_views")
    .select("report_id, seen_at")
    .eq("user_id", userId);
  if (error) {
    console.error("Error loading seen bug reports:", error);
    return null;
  }
  return Object.fromEntries((data ?? []).map((row) => [row.report_id as string, row.seen_at as string]));
}

/**
 * Mark a report seen now. Saved in this browser straight away and in the database, whose
 * (server) time is returned — or this browser's time if the database couldn't be reached.
 */
export async function markBugReportSeen(userId: string, reportId: string): Promise<string> {
  setLocalSeen(userId, reportId, new Date().toISOString());
  const { data, error } = await supabase.rpc("mark_bug_report_seen", { p_report: reportId });
  if (error || !data) return getLocalSeenBugReports(userId)[reportId] ?? new Date().toISOString();
  setLocalSeen(userId, reportId, data as string);
  return data as string;
}
