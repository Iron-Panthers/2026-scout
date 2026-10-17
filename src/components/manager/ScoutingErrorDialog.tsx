import { useEffect, useState } from "react";
import { getSubmissionDetails, type SubmissionDetails } from "@/lib/matchRescouts";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoutPickerList } from "@/components/manager/ScoutAssignmentDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Profile } from "@/types";

export interface ScoutingErrorTarget {
  matchId: string;
  scouterId: string;
  devUserId?: string;
  matchNumber: number;
  role: string;
  scouterName: string;
  comment: string;
}

interface ScoutingErrorDialogProps {
  target: ScoutingErrorTarget | null;
  onOpenChange: (open: boolean) => void;
  availableScouts: Profile[];
  cosmeticsMap?: Record<string, Record<string, string>>;
  onAssignRescout: (profile: Profile) => Promise<void>;
}

function DataLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </div>
  );
}

/** Shows the scouting error a scouter reported on a submission and lets a manager hand it to someone else to rescout. */
export function ScoutingErrorDialog({ target, onOpenChange, availableScouts, cosmeticsMap, onAssignRescout }: ScoutingErrorDialogProps) {
  const [picked, setPicked] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  const [details, setDetails] = useState<SubmissionDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setPicked(null);
    setSaving(false);
    setDetails(null);
    if (!target) return;
    let cancelled = false;
    setLoadingDetails(true);
    getSubmissionDetails({
      matchId: target.matchId,
      role: target.role,
      scouterId: target.scouterId,
      scouterName: target.scouterName,
      matchNumber: target.matchNumber,
      devUserId: target.devUserId,
    }).then((result) => {
      if (cancelled) return;
      setDetails(result);
      setLoadingDetails(false);
    });
    return () => { cancelled = true; };
  }, [target]);

  const confirm = async () => {
    if (!picked) return;
    setSaving(true);
    await onAssignRescout(picked);
    setSaving(false);
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Scouting error — Q{target?.matchNumber} {target?.role.toUpperCase()}
          </DialogTitle>
          <DialogDescription>Reported by {target?.scouterName}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">Scouting error</h3>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-sm">
              {target?.comment}
            </p>

            <h3 className="pt-2 text-sm font-semibold">Scouting data</h3>
            {loadingDetails ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !details ? (
              <p className="text-sm text-muted-foreground">Couldn't load this submission's data.</p>
            ) : (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <DataLine label="Team" value={details.row.teamNumber} />
                <DataLine label="Auto fuel" value={details.row.autoShots} />
                <DataLine label="Teleop fuel" value={details.row.teleopShots} />
                <DataLine label="Auto climb" value={details.row.autoClimb} />
                <DataLine label="Endgame climb" value={details.row.endgameClimb} />
                <DataLine label="Robot problems" value={details.row.robotProblems} />
                <DataLine label="Defense" value={details.row.defense} />
                <DataLine label="Comments" value={details.row.comments} />
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Raw data</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                    {JSON.stringify(details.raw, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">Assign rescout</h3>
            <ScoutPickerList availableScouts={availableScouts} onSelect={setPicked} cosmeticsMap={cosmeticsMap} selectedId={picked?.id} listClassName="max-h-[40vh]" />
          </div>
        </div>

        {picked && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm">
              Assign <strong>{picked.name || "Unknown"}</strong> to rescout? The current submission by{" "}
              <strong>{target?.scouterName}</strong> will be <strong className="text-destructive">permanently deleted</strong>.
            </p>
            <Button onClick={confirm} disabled={saving} className="w-full">
              {saving ? "Assigning..." : "Delete submission & assign rescout"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
