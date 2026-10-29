import { useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function LiveNoteHeader() {
  return (
    <div className="flex items-center gap-2">
      <Radio className="h-4 w-4 text-muted-foreground" />
      <p className="text-sm font-semibold">Live Picklist Notes</p>
    </div>
  );
}

/**
 * The host's notes on a team for the live picklist, kept apart from their own picklist
 * notes and shared with everyone watching. Key it by team so it resets.
 */
export function LiveTeamNoteEditor({ note, onChange }: { note: string; onChange: (note: string) => void }) {
  const [draft, setDraft] = useState(note);

  const save = () => {
    const saved = draft.trim() === "" ? "" : draft;
    setDraft(saved);
    onChange(saved);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <LiveNoteHeader />
      <p className="text-xs text-muted-foreground">Everyone watching the live picklist can read these.</p>
      <Textarea
        value={draft}
        onChange={(changeEvent) => setDraft(changeEvent.target.value)}
        placeholder="Notes on this team for the live picklist..."
        className="min-h-20"
      />
      <div className="flex justify-end gap-2">
        {draft !== note && (
          <Button variant="outline" size="sm" onClick={() => setDraft(note)}>
            Cancel
          </Button>
        )}
        <Button size="sm" disabled={draft === note} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** The live picklist's notes on a team, for everyone other than the host. */
export function LiveTeamNote({ note }: { note: string }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <LiveNoteHeader />
      <p className="whitespace-pre-wrap wrap-anywhere text-sm">{note}</p>
    </div>
  );
}
