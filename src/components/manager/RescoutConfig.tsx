import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PIT_PHOTO_FIELD, pitScoutingQuestions } from "@/config/pitScoutingConfig";
import type { PitScoutingSubmission } from "@/types/pitScouting";

function answerText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ") || "—";
  return typeof value === "string" && value.trim() ? value : "—";
}

interface RescoutConfigProps {
  teamNumber: number;
  submission: PitScoutingSubmission | undefined;
  onCancel: () => void;
  /** Called with the chosen field ids once the manager is ready to pick a scouter. */
  onContinue: (fields: string[]) => void;
}

/** Lets a manager pick which pit scouting fields a rescout asks the scouter to redo. */
export function RescoutConfig({ teamNumber, submission, onCancel, onContinue }: RescoutConfigProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allIds = [...pitScoutingQuestions.map((q) => q.id), PIT_PHOTO_FIELD];

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });

  const rows = [
    ...pitScoutingQuestions.map((q) => ({ id: q.id, label: q.label, current: answerText(submission?.pit_data?.[q.id]) })),
    { id: PIT_PHOTO_FIELD, label: "Robot photo", current: submission?.photo_url ? "Photo on file" : "No photo" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border space-y-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to assignments
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Rescout Config — Team {teamNumber}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick the fields the scouter has to redo. They'll only see these, pre-filled with the current answers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set(allIds))}>Select all</Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              id={`rescout-${row.id}`}
              checked={selected.has(row.id)}
              onCheckedChange={(checked) => toggle(row.id, checked === true)}
              className="mt-1"
            />
            {/* min-w-0 + wrap-anywhere: a long answer (even one unbroken word) wraps inside the box */}
            <Label htmlFor={`rescout-${row.id}`} className="min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-1 font-normal">
              <span className="block font-medium wrap-anywhere">{row.label}</span>
              <span className="block whitespace-pre-wrap text-sm leading-normal text-muted-foreground wrap-anywhere">Current: {row.current}</span>
            </Label>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-border flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{selected.size} field{selected.size === 1 ? "" : "s"} selected</span>
        <Button disabled={selected.size === 0} onClick={() => onContinue(allIds.filter((id) => selected.has(id)))}>
          Choose scouter &amp; send
        </Button>
      </div>
    </div>
  );
}
