import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Bug, CheckCircle2, CircleDot, MessageSquare, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  BUG_INBOX_KEY,
  MAX_BUG_COMMENT_LENGTH,
  MAX_BUG_DESCRIPTION_LENGTH,
  MAX_BUG_TITLE_LENGTH,
  addBugReportComment,
  bugReportIdFromKey,
  bugReportKey,
  createBugReport,
  getBugReportComments,
  deleteBugReport,
  setBugReportFixed,
  type BugReportComment,
} from "@/lib/bugReports";
import type { useBugReports } from "@/hooks/useBugReports";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Filter = "open" | "fixed" | "all";

interface BugReportInboxProps {
  /** "bug" for the inbox, "bug:<report id>" for one report. */
  openKey: string;
  onOpen: (key: string) => void;
  /** Back to the conversation list (phones). */
  onBack: () => void;
  userId: string;
  isDeveloper: boolean;
  nameOf: (id: string | null) => string;
  avatarOf: (id: string) => ReactNode;
  bugReports: ReturnType<typeof useBugReports>;
}

/**
 * Bug Reporting: a shared inbox of reports about problems with the app. Anyone can file a
 * report and comment under any report; everyone sees every report; developers mark them
 * fixed (or reopen them).
 */
export function BugReportInbox({ openKey, onOpen, onBack, userId, isDeveloper, nameOf, avatarOf, bugReports }: BugReportInboxProps) {
  const { toast } = useToast();
  const { reports, loading, reload, isNew, markSeen } = bugReports;
  const reportId = bugReportIdFromKey(openKey);
  const report = reports.find((r) => r.id === reportId) ?? null;

  const [filter, setFilter] = useState<Filter>("open");
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState<BugReportComment[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // The open report's comments, kept live
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    getBugReportComments(reportId).then((list) => !cancelled && setComments(list));
    const channel = supabase
      .channel(`bug-report-comments-${reportId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bug_report_comments", filter: `report_id=eq.${reportId}` },
        (payload) => {
          const added = payload.new as BugReportComment;
          setComments((current) => (current.some((c) => c.id === added.id) ? current : [...current, added]));
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [reportId]);

  // Looking at a report (including new activity while it's open) marks it seen
  useEffect(() => {
    if (report) markSeen(report.id);
  }, [report?.id, report?.updated_at, comments.length, markSeen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ block: "end" });
  }, [comments.length, reportId]);

  const visible = reports.filter((r) => filter === "all" || r.status === filter);

  async function fileReport() {
    if (!title.trim() || !description.trim() || busy) return;
    setBusy(true);
    const created = await createBugReport(userId, title, description);
    setBusy(false);
    if (!created) {
      toast({ title: "Report not sent", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    setTitle("");
    setDescription("");
    setComposing(false);
    markSeen(created.id);
    await reload();
    onOpen(bugReportKey(created.id));
  }

  async function postComment() {
    if (!reportId || !comment.trim() || busy || report?.status === "fixed") return;
    setBusy(true);
    const added = await addBugReportComment(reportId, userId, comment);
    setBusy(false);
    if (!added) {
      toast({ title: "Comment not posted", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    setComment("");
    setComments((current) => (current.some((c) => c.id === added.id) ? current : [...current, added]));
  }

  async function toggleFixed() {
    if (!report || busy) return;
    setBusy(true);
    const ok = await setBugReportFixed(report.id, report.status !== "fixed");
    setBusy(false);
    if (!ok) toast({ title: "Couldn't update the report", variant: "destructive" });
    else reload();
  }

  /** Developers only: deletes the open report and everything under it, then goes back to the inbox. */
  async function removeReport() {
    if (!report || busy) return;
    setBusy(true);
    const ok = await deleteBugReport(report.id);
    setBusy(false);
    setConfirmingDelete(false);
    if (!ok) {
      toast({ title: "Couldn't delete the report", variant: "destructive" });
      return;
    }
    toast({ title: "Bug report deleted" });
    onOpen(BUG_INBOX_KEY);
    reload();
  }

  const statusBadge = (status: "open" | "fixed") =>
    status === "fixed" ? (
      <Badge className="gap-1 border border-green-600/40 bg-green-600/15 text-green-500">
        <CheckCircle2 className="h-3 w-3" /> Fixed
      </Badge>
    ) : (
      <Badge className="gap-1 border border-amber-500/40 bg-amber-500/15 text-amber-500">
        <CircleDot className="h-3 w-3" /> Open
      </Badge>
    );

  // ── One report ──────────────────────────────────────────────────────────
  if (reportId) {
    if (!report) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          {loading ? "Loading report..." : "This report no longer exists."}
          <Button variant="outline" size="sm" onClick={() => onOpen(BUG_INBOX_KEY)}>
            Back to Bug Reporting
          </Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-col">
        <div className="flex items-start gap-2 border-b border-border pb-3">
          <Button variant="ghost" size="icon" onClick={() => onOpen(BUG_INBOX_KEY)} aria-label="Back to Bug Reporting">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold break-words">{report.title}</p>
              {statusBadge(report.status)}
            </div>
            <p className="text-xs text-muted-foreground">
              Reported by {nameOf(report.author_id)} · {formatWhen(report.created_at)}
              {report.status === "fixed" && report.fixed_at && ` · Fixed by ${nameOf(report.fixed_by)} ${formatWhen(report.fixed_at)}`}
            </p>
          </div>
          {isDeveloper && (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant={report.status === "fixed" ? "outline" : "default"} onClick={toggleFixed} disabled={busy} className="gap-1.5">
                {report.status === "fixed" ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {report.status === "fixed" ? "Reopen" : "Mark as fixed"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                aria-label="Delete this bug report"
                title="Delete this bug report"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Deleting can't be undone: confirm first */}
        <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this bug report?</DialogTitle>
              <DialogDescription>
                "{report.title}" and all {comments.length} comment{comments.length === 1 ? "" : "s"} under it will be permanently deleted
                for everyone. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={removeReport} disabled={busy}>
                {busy ? "Deleting..." : "Delete report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
          {/* The report itself */}
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              {avatarOf(report.author_id)}
              <span className="text-sm font-semibold">{nameOf(report.author_id)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{report.description}</p>
          </div>

          {comments.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              {avatarOf(c.author_id)}
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-semibold">{nameOf(c.author_id)}</span>
                  <span className="ml-2 text-muted-foreground">{formatWhen(c.created_at)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
              </div>
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>

        {/* A fixed report is closed to comments until a developer reopens it */}
        {report.status === "fixed" ? (
          <p className="flex items-center justify-center gap-1.5 border-t border-border pt-3 text-center text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
            This report is fixed.
          </p>
        ) : (
          <form
            className="flex items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              postComment();
            }}
          >
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_BUG_COMMENT_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  postComment();
                }
              }}
              placeholder="Add a comment"
              rows={1}
              className="max-h-32 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={!comment.trim() || busy} aria-label="Post comment">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </div>
    );
  }

  // ── The inbox ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-400">
          <Bug className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Bug Reporting</p>
          <p className="text-xs text-muted-foreground">Everyone can see reports and comment; developers mark them fixed</p>
        </div>
        {!composing && (
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setComposing(true)}>
            <Plus className="h-3.5 w-3.5" /> New report
          </Button>
        )}
      </div>

      {composing ? (
        <form
          className="space-y-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            fileReport();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, MAX_BUG_TITLE_LENGTH))}
            placeholder="Short summary, e.g. “Shop won't load on iPad”"
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_BUG_DESCRIPTION_LENGTH))}
            placeholder="What were you doing, what did you expect, and what happened instead?"
            rows={6}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComposing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || !description.trim() || busy}>
              Submit report
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex gap-1 py-3">
            {(["open", "fixed", "all"] as Filter[]).map((option) => (
              <Button key={option} size="sm" variant={filter === option ? "secondary" : "ghost"} onClick={() => setFilter(option)} className="capitalize">
                {option}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {option === "all" ? reports.length : reports.filter((r) => r.status === option).length}
                </span>
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading reports...</p>}
            {!loading && visible.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {filter === "fixed" ? "Nothing's been marked fixed yet." : "No open reports. Found a problem? File a new report."}
              </p>
            )}
            {visible.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(bugReportKey(r.id))}
                className="flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent/50"
              >
                <div className="pt-0.5">
                  {r.status === "fixed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <CircleDot className="h-4 w-4 text-amber-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${isNew(r) ? "font-bold" : "font-medium"}`}>{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {nameOf(r.author_id)} · {formatWhen(r.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {r.commentCount > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {r.commentCount}
                    </span>
                  )}
                  {isNew(r) && <span className="h-2 w-2 rounded-full bg-red-600" aria-label="New activity" />}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
