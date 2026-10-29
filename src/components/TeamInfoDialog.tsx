import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, ChevronDown, Loader2, NotebookPen } from "lucide-react";
import { TeamSummary } from "@/components/strategy/TeamInfoPage";
import { isDevEventId } from "@/lib/devMode";
import { getTeamNote, upsertTeamNote } from "@/lib/picklistNotes";
import { buildTeamDashboard, cachedEventLoad, loadEventData, type EventData } from "@/lib/strategyData";
import { useToast } from "@/hooks/use-toast";
import type { Event } from "@/types";

// Caches the last known-good note per event+team so reopening the dialog
// right after a save doesn't have to race a fresh fetch against that same
// write — a save that just landed is already known to be correct, so
// trust it instead of re-querying and risking a stale read winning the race.
const notesCache = new Map<string, string>();

/** The viewer's own picklist notes on a team, fetched as soon as it mounts. */
function MyNotes({ userId, eventId, teamNumber }: {
  userId?: string | null;
  eventId?: string;
  teamNumber: number;
}) {
  const { toast } = useToast();
  const cacheKey = `${eventId}:${teamNumber}`;
  const canLoad = !!userId && !!eventId;
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(() => notesCache.get(cacheKey) ?? "");
  const [loading, setLoading] = useState(() => canLoad && !notesCache.has(cacheKey));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId || !eventId || notesCache.has(cacheKey)) return;
    let mounted = true;
    getTeamNote(userId, eventId, teamNumber).then((existing) => {
      if (!mounted) return;
      notesCache.set(cacheKey, existing);
      setNotes(existing);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [userId, eventId, teamNumber, cacheKey]);

  async function handleSave() {
    if (!userId || !eventId) return;
    setSaving(true);
    const success = await upsertTeamNote(userId, eventId, teamNumber, notes);
    setSaving(false);
    if (success) {
      notesCache.set(cacheKey, notes);
      toast({ title: "Notes saved" });
    } else {
      toast({ title: "Failed to save notes", variant: "destructive" });
    }
  }

  return (
    // Right margin leaves room for the dialog's close button.
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between gap-1.5" disabled={!canLoad}>
          <span className="flex items-center gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" />
            My Notes
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write anything you want to remember about this team..."
              className="min-h-24"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface TeamInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamNumber: number | null;
  event?: Event;
  userId?: string | null;
  userName: string | null;
  devMode: boolean;
  /** Extra controls for the team being viewed, shown above the notes (e.g. the live picklist's tag editor). */
  renderExtra?: (teamNumber: number) => React.ReactNode;
  /** Show the viewer's own picklist notes (on by default). */
  showMyNotes?: boolean;
  /** A control for the team being viewed, at the top right of its summary (e.g. the live picklist's DNP button). */
  renderHeaderAction?: (teamNumber: number) => React.ReactNode;
}

/**
 * A team's summary from the Teams page, in a dialog, plus the viewer's own
 * picklist notes on it. Clicking another team in its match list shows that team.
 */
export function TeamInfoDialog({
  open,
  onOpenChange,
  teamNumber,
  event,
  userId,
  userName,
  devMode,
  renderExtra,
  showMyNotes = true,
  renderHeaderAction,
}: TeamInfoDialogProps) {
  // Tagged with the event it was loaded for, so switching events shows the loading state.
  const [loaded, setLoaded] = useState<{ eventId: string; data: EventData | null; error: string | null } | null>(() => cachedEventLoad(event));
  // A team clicked in the summary's match list, tagged with the team the dialog opened on.
  const [picked, setPicked] = useState<{ from: number | null; teamNumber: number } | null>(null);
  const viewedTeam = picked && picked.from === teamNumber ? picked.teamNumber : teamNumber;
  const contentRef = useRef<HTMLDivElement>(null);

  // Closing goes back to the clicked team next time.
  const handleOpenChange = (next: boolean) => {
    if (!next) setPicked(null);
    onOpenChange(next);
  };

  // A new team's summary starts at the top.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [viewedTeam]);

  // Reloaded on every open (unless loaded in the last 30 seconds) so the summary
  // is current; the previous load stays on screen meanwhile.
  useEffect(() => {
    if (!open || !event) return;
    let mounted = true;
    const sandbox = devMode && userId && isDevEventId(event.id) ? { userId, userName } : null;
    loadEventData(event, sandbox)
      .then((data) => { if (mounted) setLoaded({ eventId: event.id, data, error: null }); })
      .catch((cause) => {
        console.error("Could not load team info data:", cause);
        if (mounted) setLoaded({ eventId: event.id, data: null, error: cause instanceof Error ? cause.message : "Could not load this event's data." });
      });
    return () => { mounted = false; };
  }, [open, event, userId, userName, devMode]);

  const eventId = event?.id;

  const current = loaded && loaded.eventId === eventId ? loaded : null;
  const data = current?.data ?? null;
  const team = useMemo(() => (data && viewedTeam ? buildTeamDashboard(viewedTeam, data) : null), [data, viewedTeam]);

  if (!viewedTeam) return null;

  let body;
  if (!event) {
    body = <p className="text-sm text-muted-foreground">Select an event.</p>;
  } else if (current?.error) {
    body = (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{current.error}</span>
      </div>
    );
  } else if (!data || !team) {
    body = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading event data...
      </p>
    );
  } else {
    body = (
      <TeamSummary
        team={team}
        data={data}
        // Events from before the setting existed are double scouted.
        scoutersPerRobot={event.scouters_per_robot ?? 2}
        onSelectTeam={(next) => setPicked({ from: teamNumber, teamNumber: next })}
        headerAction={renderHeaderAction?.(viewedTeam)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={contentRef}
        className="max-h-[90vh] max-w-[calc(100%-0.5rem)] overflow-x-hidden overflow-y-auto p-2.5 sm:max-w-4xl sm:p-6"
      >
        {/* The summary's header card shows the team; this names the dialog for screen readers. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Team {viewedTeam}</DialogTitle>
          <DialogDescription>{team?.name ?? "Team summary"}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {renderExtra?.(viewedTeam)}

          {/* Keyed so each team's notes start closed and never show another team's text. */}
          {showMyNotes && (
            <MyNotes
              key={`${eventId}:${viewedTeam}`}
              userId={userId}
              eventId={eventId}
              teamNumber={viewedTeam}
            />
          )}

          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
