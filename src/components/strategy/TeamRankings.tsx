import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ListOrdered, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getProfileNames } from "@/lib/picklists";
import { getEveryoneTeamNotes, type UserTeamNote } from "@/lib/picklistNotes";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

interface PersonalPicklist {
  userId: string;
  picked: number[];
  doNotPick: number[];
}

/** Where someone put a team in their own picklist, and a key that sorts ranked, then DNP, then unranked. */
function picklistRank(picklist: PersonalPicklist | undefined, teamNumber: number): { label: string; order: number } {
  const index = picklist?.picked.indexOf(teamNumber) ?? -1;
  if (index >= 0) return { label: `#${index + 1}`, order: index };
  if (picklist?.doNotPick.includes(teamNumber)) return { label: "DNP", order: Number.MAX_SAFE_INTEGER - 1 };
  return { label: "N/A", order: Number.MAX_SAFE_INTEGER };
}

/**
 * For the live picklist host: where everyone ranked a team in their own picklist, best
 * first, with their notes on it (the host's included) opening from their row. Lists anyone
 * who has a picklist or a note. Key it by team so it reloads.
 */
export function TeamRankings({
  eventId,
  teamNumber,
  picklists,
  currentUserId,
}: {
  eventId: string;
  teamNumber: number;
  /** Everyone's picklists for the event. */
  picklists: PersonalPicklist[];
  /** The host, whose own row is marked "(you)". */
  currentUserId?: string;
}) {
  const [notes, setNotes] = useState<UserTeamNote[] | null>(null);
  const [notesFailed, setNotesFailed] = useState(false);
  // Null until the names have loaded
  const [names, setNames] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    let mounted = true;
    getEveryoneTeamNotes(eventId, teamNumber).then((loaded) => {
      if (!mounted) return;
      if (loaded) setNotes(loaded);
      else {
        setNotes([]);
        setNotesFailed(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, [eventId, teamNumber]);

  // Anyone who's sorted some teams, or written a note on this one
  const people = useMemo(() => {
    if (!notes) return null;
    const notesByUser = new Map(notes.map((note) => [note.userId, note]));
    const ids = new Set([
      ...picklists.filter((picklist) => picklist.picked.length + picklist.doNotPick.length > 0).map((picklist) => picklist.userId),
      ...notesByUser.keys(),
    ]);
    return [...ids].map((userId) => ({
      userId,
      rank: picklistRank(
        picklists.find((picklist) => picklist.userId === userId),
        teamNumber
      ),
      note: notesByUser.get(userId),
    }));
  }, [notes, picklists, teamNumber]);

  const peopleKey = people?.map((person) => person.userId).join() ?? "";
  useEffect(() => {
    if (!peopleKey) return;
    let mounted = true;
    getProfileNames(peopleKey.split(",")).then((loaded) => {
      if (mounted) setNames(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [peopleKey]);

  const sorted = people
    ? [...people].sort(
        (a, b) =>
          a.rank.order - b.rank.order ||
          // Among the same rank, people with notes come first
          Number(!a.note) - Number(!b.note) ||
          (names?.get(a.userId) ?? "").localeCompare(names?.get(b.userId) ?? "")
      )
    : null;

  const name = (userId: string) => (
    <span className="min-w-0 truncate">
      {names?.get(userId) ?? (names ? "Unknown" : "…")}
      {userId === currentUserId && <span className="font-normal text-muted-foreground"> (you)</span>}
    </span>
  );
  const rank = (label: string) => (
    <span className="min-w-8 text-right font-semibold text-foreground tabular-nums" title="Their picklist rank">
      {label}
    </span>
  );

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Rankings & Notes</p>
        {sorted && sorted.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">({sorted.length})</span>}
      </div>

      {notesFailed && <p className="text-xs text-destructive">Could not load notes.</p>}
      {!sorted ? (
        <div className="flex justify-center p-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody has made a picklist or written notes on {teamNumber} yet.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((person) =>
            person.note ? (
              <Collapsible key={person.userId}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="group w-full justify-between gap-2">
                    {name(person.userId)}
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
                      {person.note.updatedAt && formatDate(person.note.updatedAt)}
                      {rank(person.rank.label)}
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="mt-1.5 whitespace-pre-wrap wrap-anywhere rounded-md bg-muted/50 p-3 text-sm">{person.note.notes}</p>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              // Same size as a note's button, so the ranks line up
              <div
                key={person.userId}
                className="flex h-8 items-center justify-between gap-2 rounded-md border px-3 text-sm font-medium"
              >
                {name(person.userId)}
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  No notes
                  {rank(person.rank.label)}
                  <span className="w-3.5" />
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
