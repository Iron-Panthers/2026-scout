import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getMessageContacts, type MessageContact } from "@/lib/messages";
import { sendBoard, type SavedBoard } from "@/lib/strategyBoard";

interface SendBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  senderId: string;
  matchKey: string;
  matchName: string;
  /** The board as it is now, sent as a copy. */
  board: SavedBoard;
}

/** Picks who to send a copy of this match's board to. */
export function SendBoardDialog({ open, onOpenChange, senderId, matchKey, matchName, board }: SendBoardDialogProps) {
  const { toast } = useToast();
  const online = useOnlineStatus();
  const [contacts, setContacts] = useState<MessageContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || contacts) return;
    let cancelled = false;
    getMessageContacts().then((list) => { if (!cancelled) setContacts(list); });
    return () => { cancelled = true; };
  }, [open, contacts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (contacts ?? []).filter((contact) => !q || contact.name.toLowerCase().includes(q));
  }, [contacts, query]);

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const close = (next: boolean) => {
    if (sending) return;
    if (!next) {
      setChosen(new Set());
      setQuery("");
    }
    onOpenChange(next);
  };

  const send = async () => {
    setSending(true);
    try {
      await sendBoard(senderId, [...chosen], matchKey, board);
      const names = (contacts ?? []).filter((contact) => chosen.has(contact.id)).map((contact) => contact.name);
      toast({ title: "Board sent", description: `${matchName} sent to ${names.join(", ")}.` });
      setSending(false);
      close(false);
    } catch (error) {
      console.error("Error sending strategy board:", error);
      toast({ title: "Couldn't send the board", description: "Check your connection and try again.", variant: "destructive" });
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send {matchName}</DialogTitle>
          <DialogDescription>
            They get a copy of every page to view and edit. Sending to someone again replaces what you sent them before.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" className="pl-8" />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border">
          {!contacts ? (
            <p className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading people...
            </p>
          ) : shown.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No one found.</p>
          ) : (
            shown.map((contact) => (
              <label key={contact.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50">
                <Checkbox checked={chosen.has(contact.id)} onCheckedChange={() => toggle(contact.id)} />
                <span className="flex-1 truncate text-sm">{contact.name}</span>
                {contact.is_manager && <span className="text-xs text-muted-foreground">Manager</span>}
              </label>
            ))
          )}
        </div>

        <DialogFooter>
          {!online && <p className="mr-auto self-center text-xs text-destructive">You're offline.</p>}
          <Button variant="outline" onClick={() => close(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={chosen.size === 0 || sending || !online}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            Send{chosen.size > 0 ? ` to ${chosen.size}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
