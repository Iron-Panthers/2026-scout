import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bug, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { getMessageContacts, getUnreadMessageCount, type Message, type MessageContact } from "@/lib/messages";
import { bugReportIdFromKey, bugReportKey, isBugReportParticipant, type BugReport, type BugReportComment } from "@/lib/bugReports";
import { useBugReports } from "@/hooks/useBugReports";

interface MessagesContextValue {
  unreadCount: number;
  contacts: MessageContact[];
  /** Re-counts unread messages (e.g. after a conversation is read). */
  refreshUnread: () => Promise<void>;
  /**
   * What's open: a person's conversation on the messages page (their id), or a report on
   * the bug reporting page ("bug:<report id>"), so its new
   * activity doesn't also pop a notification.
   */
  setOpenConversation: (key: string | null) => void;
  /** Every bug report, kept live, and which have activity you haven't seen (shared with the Bug Reporting page). */
  bugReports: ReturnType<typeof useBugReports>;
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

export function useMessages(): MessagesContextValue {
  const value = useContext(MessagesContext);
  if (!value) throw new Error("useMessages must be used inside MessagesProvider");
  return value;
}

// Pages where the floating messages button would get in the way (or there's no user)
const HIDE_BUTTON_ON = ["/login", "/guest", "/review", "/scouting", "/qual-scouting", "/messages", "/bug-reports"];

/** Where a notification's "Open" goes: a conversation, or a bug report. */
function pathFor(key: string): string {
  const reportId = bugReportIdFromKey(key);
  return reportId ? `/bug-reports?report=${reportId}` : `/messages?with=${encodeURIComponent(key)}`;
}

const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

/**
 * Tracks the signed-in user's unread messages: the count for the floating speech button's
 * badge, and an in-app notification whenever a new message arrives (outside the app, the
 * service worker shows a push notification instead). Also notifies about Bug Reporting
 * activity that concerns you: new reports (developers), and comments on or fixes to
 * reports you wrote or commented on.
 */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const userId = user?.id ?? null;
  const isDeveloper = !!profile?.is_developer;
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const openConversation = useRef<string | null>(null);
  const contactsRef = useRef<MessageContact[]>([]);
  const bugReports = useBugReports(userId);

  const refreshUnread = useCallback(async () => {
    if (!userId) return;
    setUnreadCount(await getUnreadMessageCount(userId));
  }, [userId]);

  const setOpenConversation = useCallback((key: string | null) => {
    openConversation.current = key;
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getUnreadMessageCount(userId).then((count) => !cancelled && setUnreadCount(count));
    getMessageContacts().then((list) => {
      if (cancelled) return;
      contactsRef.current = list;
      setContacts(list);
    });

    const nameOf = (id: string | null) => contactsRef.current.find((contact) => contact.id === id)?.name ?? "Someone";
    const notify = (key: string, title: string, description: string) => {
      if (openConversation.current === key) return; // already on screen
      toast({
        title,
        description: preview(description),
        action: (
          <ToastAction altText="Open" onClick={() => navigate(pathFor(key))}>
            Open
          </ToastAction>
        ),
      });
    };

    const channel = supabase
      .channel(`messages-inbox-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const message = payload.new as Message;
          if (openConversation.current === message.sender_id) return;
          setUnreadCount((count) => count + 1);
          notify(message.sender_id, nameOf(message.sender_id), message.body);
        }
      )
      // Read receipts (from another device or tab) lower the count
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` },
        () => {
          getUnreadMessageCount(userId).then((count) => !cancelled && setUnreadCount(count));
        }
      )
      // Bug Reporting: new reports go to developers
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bug_reports" }, (payload) => {
        const report = payload.new as BugReport;
        if (!isDeveloper || report.author_id === userId) return;
        notify(bugReportKey(report.id), `New bug report from ${nameOf(report.author_id)}`, report.title);
      })
      // ...comments go to the report's author, everyone who commented, and developers
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bug_report_comments" }, async (payload) => {
        const comment = payload.new as BugReportComment;
        if (comment.author_id === userId) return;
        if (!isDeveloper && !(await isBugReportParticipant(comment.report_id, userId))) return;
        notify(bugReportKey(comment.report_id), `${nameOf(comment.author_id)} commented on a bug report`, comment.body);
      })
      // ...and the author hears when a developer marks it fixed
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bug_reports" }, (payload) => {
        const report = payload.new as BugReport;
        if (report.author_id !== userId || report.status !== "fixed" || report.fixed_by === userId) return;
        if ((payload.old as Partial<BugReport>).status === "fixed") return;
        notify(bugReportKey(report.id), "Your bug report was marked fixed", report.title);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, isDeveloper, toast, navigate]);

  // Signed out: nothing to count (state from a previous user is ignored, then replaced on sign-in)
  const visibleUnread = userId ? unreadCount : 0;
  const visibleContacts = userId ? contacts : [];
  const showButton = !!userId && !HIDE_BUTTON_ON.some((path) => location.pathname.startsWith(path));

  return (
    <MessagesContext.Provider
      value={{ unreadCount: visibleUnread, contacts: visibleContacts, refreshUnread, setOpenConversation, bugReports }}
    >
      {children}
      {showButton && (
        // Chat button on the right edge, with a smaller Bug Reporting tab hanging under it
        <div className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-end">
          <button
            type="button"
            onClick={() => navigate("/messages")}
            aria-label={visibleUnread > 0 ? `Messages, ${visibleUnread} unread` : "Messages"}
            className="relative flex h-12 w-12 items-center justify-center rounded-tl-xl border border-r-0 border-border bg-card text-foreground shadow-lg transition-colors hover:bg-accent"
          >
            <MessageCircle className="h-6 w-6" />
            {visibleUnread > 0 && (
              <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
                {visibleUnread > 99 ? "99+" : visibleUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/bug-reports")}
            aria-label={bugReports.newCount > 0 ? `Bug Reporting, ${bugReports.newCount} with new activity` : "Bug Reporting"}
            className="relative flex h-7 w-7 items-center justify-center rounded-bl-lg border border-r-0 border-t-0 border-border bg-card text-red-400 shadow-lg transition-colors hover:bg-accent"
          >
            <Bug className="h-3.5 w-3.5" />
            {bugReports.newCount > 0 && (
              <span className="absolute -left-1.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-background">
                {bugReports.newCount > 99 ? "99+" : bugReports.newCount}
              </span>
            )}
          </button>
        </div>
      )}
    </MessagesContext.Provider>
  );
}
