import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useGoBack } from "@/hooks/useGoBack";
import { useMessages } from "@/contexts/MessagesContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  MAX_MESSAGE_LENGTH,
  getMyMessages,
  initialsOf,
  markConversationRead,
  sendMessage,
  type Message,
} from "@/lib/messages";

function formatTime(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Direct messages between scouts and managers: conversation list on the left, the open
 * conversation on the right. (Bug Reporting has its own page, /bug-reports.)
 */
export default function Messages() {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { contacts, refreshUnread, setOpenConversation } = useMessages();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // The person whose conversation is open
  const openKey = searchParams.get("with");
  const openId = openKey;

  // Bug Reporting moved to its own page: forward old links (e.g. earlier push notifications)
  useEffect(() => {
    if (openKey === "bug" || openKey?.startsWith("bug:")) {
      const reportId = openKey.startsWith("bug:") ? openKey.slice(4) : null;
      navigate(reportId ? `/bug-reports?report=${reportId}` : "/bug-reports", { replace: true });
    }
  }, [openKey, navigate]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const open = (key: string | null) => setSearchParams(key ? { with: key } : {}, { replace: true });

  // Load history, then keep it live
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMyMessages(userId).then((list) => {
      if (cancelled) return;
      setMessages(list);
      setLoading(false);
    });
    const upsert = (payload: { new: unknown }) => {
      const message = payload.new as Message;
      if (!message || !("id" in message)) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id)
          ? current.map((m) => (m.id === message.id ? message : m))
          : [message, ...current]
      );
    };
    const channel = supabase
      .channel(`messages-page-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` }, upsert)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${userId}` }, upsert)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // What's open doesn't pop in-app notifications
  useEffect(() => {
    setOpenConversation(openKey);
    return () => setOpenConversation(null);
  }, [openKey, setOpenConversation]);

  const thread = useMemo(
    () =>
      openId
        ? messages
            .filter((m) => (m.sender_id === openId && m.recipient_id === userId) || (m.sender_id === userId && m.recipient_id === openId))
            .slice()
            .reverse()
        : [],
    [messages, openId, userId]
  );

  // Reading a conversation marks it read
  const unreadInThread = thread.filter((m) => m.recipient_id === userId && !m.read_at).length;
  useEffect(() => {
    if (!openId || unreadInThread === 0) return;
    markConversationRead(openId).then(refreshUnread);
  }, [openId, unreadInThread, refreshUnread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, openId]);

  // Latest message and unread count per person
  const summaries = useMemo(() => {
    const byPerson = new Map<string, { last: Message; unread: number }>();
    for (const message of messages) {
      const other = message.sender_id === userId ? message.recipient_id : message.sender_id;
      const entry = byPerson.get(other) ?? { last: message, unread: 0 };
      if (message.recipient_id === userId && !message.read_at) entry.unread++;
      byPerson.set(other, entry);
    }
    return byPerson;
  }, [messages, userId]);

  // People you've talked to (most recent first), then everyone else (managers first)
  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts
      .filter((contact) => !query || contact.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        const lastA = summaries.get(a.id)?.last.created_at ?? "";
        const lastB = summaries.get(b.id)?.last.created_at ?? "";
        return lastB.localeCompare(lastA);
      });
  }, [contacts, summaries, search]);

  const openContact = contacts.find((contact) => contact.id === openId) ?? null;

  async function handleSend() {
    if (!userId || !openId || !draft.trim() || sending) return;
    setSending(true);
    const sent = await sendMessage(userId, openId, draft);
    setSending(false);
    if (!sent) {
      toast({ title: "Message not sent", description: "Check your connection and try again.", variant: "destructive" });
      return;
    }
    setDraft("");
    setMessages((current) => (current.some((m) => m.id === sent.id) ? current : [sent, ...current]));
  }

  const listPanel = (
    <div className="flex min-h-0 flex-col">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {people.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No one found.</p>}
        {people.map((contact) => {
          const summary = summaries.get(contact.id);
          const active = contact.id === openId;
          return (
            <button
              key={contact.id}
              type="button"
              onClick={() => open(contact.id)}
              className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${active ? "bg-accent" : "hover:bg-accent/50"}`}
            >
              <CosmeticAvatar avatarUrl={contact.avatar_url} initials={initialsOf(contact.name)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-sm ${summary?.unread ? "font-bold" : "font-medium"}`}>{contact.name}</span>
                  {contact.is_manager && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      Manager
                    </Badge>
                  )}
                </div>
                {summary && (
                  <p className={`truncate text-xs ${summary.unread ? "text-foreground" : "text-muted-foreground"}`}>
                    {summary.last.sender_id === userId ? "You: " : ""}
                    {summary.last.body}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {summary && <span className="text-[10px] text-muted-foreground">{formatTime(summary.last.created_at)}</span>}
                {summary && summary.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {summary.unread}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const threadPanel = openContact ? (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => open(null)} aria-label="Back to conversations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {/* Their picture and name open their profile */}
        <button
          type="button"
          onClick={() => navigate(`/profile/${openContact.id}`)}
          className="flex min-w-0 items-center gap-3 rounded-lg p-1 -m-1 text-left transition-colors hover:bg-accent/50"
          aria-label={`View ${openContact.name}'s profile`}
        >
          <CosmeticAvatar avatarUrl={openContact.avatar_url} initials={initialsOf(openContact.name)} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold hover:underline">{openContact.name}</p>
            <p className="text-xs text-muted-foreground">{openContact.is_manager ? "Manager" : "Scout"}</p>
          </div>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3">
        {thread.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hi to {openContact.name}!</p>
        )}
        {thread.map((message) => {
          const mine = message.sender_id === userId;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
                }`}
              >
                {/* wrap-anywhere (not break-words) so one long word breaks instead of widening the bubble and panel */}
                <p className="whitespace-pre-wrap wrap-anywhere">{message.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatTime(message.created_at)}
                  {mine && message.read_at ? " · Read" : ""}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={threadEndRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a new line
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={`Message ${openContact.name}`}
          rows={1}
          className="max-h-32 min-h-10 resize-none"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  ) : (
    <div className="hidden items-center justify-center text-sm text-muted-foreground md:flex">
      Pick someone to start a conversation.
    </div>
  );

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto flex h-[calc(100dvh-2.5rem)] max-w-5xl flex-col p-6">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" onClick={goBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>

        {loading ? (
          <p className="py-10 text-center text-muted-foreground">Loading messages...</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 rounded-lg border border-border bg-card p-3 md:grid-cols-[300px_minmax(0,1fr)] md:divide-x md:divide-border">
            {/* On phones, show the list or the open conversation, not both */}
            <div className={`${openKey ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col`}>{listPanel}</div>
            <div className={`${openKey ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col md:pl-4 [&>*]:flex-1`}>{threadPanel}</div>
          </div>
        )}
      </main>
    </div>
  );
}
