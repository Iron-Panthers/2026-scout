import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bug, ChevronLeft, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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

/** Where tapping a notification goes: a conversation, or a bug report. */
function pathFor(key: string): string {
  const reportId = bugReportIdFromKey(key);
  return reportId ? `/bug-reports?report=${reportId}` : `/messages?with=${encodeURIComponent(key)}`;
}

const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

/**
 * Tracks the signed-in user's unread messages: the count for the floating speech button's
 * badge, and an in-app notification whenever a new message arrives (outside the app, the
 * service worker shows a push notification instead). Also notifies about Bug Reporting
 * activity that concerns you: comments on or fixes to reports you wrote or commented on
 * (new reports don't notify anyone).
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
      const { dismiss } = toast({
        title,
        description: preview(description),
        className: "cursor-pointer",
        // Tapping it opens the conversation or report, except on the close button or at the
        // end of a swipe away (Radix cancels that click)
        onClick: (event) => {
          if (event.defaultPrevented || (event.target as HTMLElement).closest("[toast-close]")) return;
          dismiss();
          navigate(pathFor(key));
        },
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
      // Bug Reporting (new reports don't notify anyone): comments go to the report's author,
      // everyone who commented, and developers
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
  const hasActivity = visibleUnread > 0 || bugReports.newCount > 0;

  // The chat and bug buttons stay tucked off the right edge until the tab pulls them out
  const [trayOpen, setTrayOpen] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere else tucks them back in
  useEffect(() => {
    if (!trayOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!trayRef.current?.contains(e.target as Node)) setTrayOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [trayOpen]);

  const openFromTray = (path: string) => {
    setTrayOpen(false);
    navigate(path);
  };

  return (
    <MessagesContext.Provider
      value={{ unreadCount: visibleUnread, contacts: visibleContacts, refreshUnread, setOpenConversation, bugReports }}
    >
      {children}
      {showButton && (
        // A tab on the right edge; clicking it slides out the chat and Bug Reporting buttons
        <div
          ref={trayRef}
          className={`fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center transition-transform duration-200 ease-out ${
            trayOpen ? "translate-x-0" : "translate-x-10.5"
          }`}
        >
          <button
            type="button"
            onClick={() => setTrayOpen((open) => !open)}
            aria-expanded={trayOpen}
            aria-label={trayOpen ? "Hide messages and bug reporting" : hasActivity ? "Show messages and bug reporting, new activity" : "Show messages and bug reporting"}
            className="relative flex h-14 w-5 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${trayOpen ? "rotate-180" : ""}`} />
            {!trayOpen && hasActivity && (
              <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-background" />
            )}
          </button>
          <div
            inert={!trayOpen}
            className={`flex flex-col transition-opacity duration-200 ${trayOpen ? "opacity-100" : "opacity-0"}`}
          >
            <button
              type="button"
              onClick={() => openFromTray("/messages")}
              aria-label={visibleUnread > 0 ? `Messages, ${visibleUnread} unread` : "Messages"}
              className="relative flex h-10.5 w-10.5 items-center justify-center rounded-tl-xl border border-r-0 border-border bg-card text-foreground shadow-lg transition-colors hover:bg-accent"
            >
              <MessageCircle className="h-6 w-6" strokeWidth={1.5} />
              {visibleUnread > 0 && (
                <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
                  {visibleUnread > 99 ? "99+" : visibleUnread}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => openFromTray("/bug-reports")}
              aria-label={bugReports.newCount > 0 ? `Bug Reporting, ${bugReports.newCount} with new activity` : "Bug Reporting"}
              className="relative flex h-10.5 w-10.5 items-center justify-center rounded-bl-lg border border-r-0 border-t-0 border-border bg-card text-red-400 shadow-lg transition-colors hover:bg-accent"
            >
              <Bug className="h-6 w-6" strokeWidth={1.5} />
              {bugReports.newCount > 0 && (
                <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-background">
                  {bugReports.newCount > 99 ? "99+" : bugReports.newCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </MessagesContext.Provider>
  );
}
