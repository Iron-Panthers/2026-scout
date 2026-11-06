import { useEffect, useState } from "react";
import { getSubmissionDetails, type SubmissionDetails } from "@/lib/matchRescouts";
import { formatStat, type StatRange, type SuspiciousSubmission } from "@/lib/suspiciousSubmissions";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
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
  /** The scouting error the scouter reported, if they did. */
  comment: string | null;
  /** Set when the submission's numbers are outside the team's usual range. */
  suspicious: SuspiciousSubmission | null;
}

interface ScoutingErrorDialogProps {
  target: ScoutingErrorTarget | null;
  onOpenChange: (open: boolean) => void;
  availableScouts: Profile[];
  cosmeticsMap?: Record<string, Record<string, string>>;
  onAssignRescout: (profile: Profile) => Promise<void>;
  /** A manager already checked this error (or suspicious entry) and found the data correct. */
  validated: boolean;
  /** Marks the data correct (no rescout needed), or undoes that. */
  onSetValidated: (validated: boolean) => Promise<void>;
}

function DataLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </div>
  );
}

/**
 * One stat against the team's usual range: the light band is the usual range, the darker one the
 * middle half of its submissions and the dot is this one.
 */
function RangeStrip({ stat }: { stat: StatRange }) {
  const low = Math.max(0, stat.low);
  const values = [low, stat.high, stat.value];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.04;
  lo -= pad;
  hi += pad;
  const at = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  const span = (from: number, to: number) => ({ left: at(from), width: `${((to - from) / (hi - lo)) * 100}%` });

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{stat.label}</span>
        <span className={`tabular-nums font-semibold ${stat.suspicious ? "text-red-500" : ""}`}>{formatStat(stat.value)}</span>
      </div>
      <div className="relative h-4" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-foreground/15" style={span(low, stat.high)} />
        <div className="absolute top-1/2 h-2 -translate-y-1/2 bg-foreground/30" style={span(stat.q1, stat.q3)} />
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ${stat.suspicious ? "bg-red-600" : "bg-foreground"}`}
          style={{ left: at(stat.value) }}
        />
      </div>
    </div>
  );
}

/**
 * Shows the scouting error a scouter reported on a submission, or why its numbers look
 * suspicious, and lets a manager mark the data correct or hand it to someone else to rescout.
 */
export function ScoutingErrorDialog({ target, onOpenChange, availableScouts, cosmeticsMap, onAssignRescout, validated, onSetValidated }: ScoutingErrorDialogProps) {
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

  const setValidated = async (next: boolean) => {
    setSaving(true);
    await onSetValidated(next);
    setSaving(false);
  };

  const kind = target?.comment != null ? "Scouting error" : "Suspicious";
  const suspicious = target?.suspicious;

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
            <AlertTriangle className={`h-5 w-5 ${target?.comment != null ? "text-red-400" : "text-red-700"}`} />
            {kind} — Q{target?.matchNumber} {target?.role.toUpperCase()}
          </DialogTitle>
          <DialogDescription>{target?.comment != null ? "Reported" : "Scouted"} by {target?.scouterName}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            {target?.comment != null && (
              <>
                <h3 className="text-sm font-semibold">Scouting error</h3>
                <p className="whitespace-pre-wrap break-words rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-sm">
                  {target.comment}
                </p>
              </>
            )}

            {suspicious && (
              <>
                <h3 className={`text-sm font-semibold ${target?.comment != null ? "pt-2" : ""}`}>Suspicious</h3>
                <div className="space-y-3 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Team {suspicious.teamNumber}'s usual range at this event, from its {suspicious.sample} scouted submissions.
                  </p>
                  {suspicious.stats.map((stat) => (
                    <RangeStrip key={stat.label} stat={stat} />
                  ))}
                </div>
              </>
            )}

            {/* Flagged, but the data checks out: keep it, no rescout */}
            {validated ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/15 p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="min-w-0 flex-1">Checked: the data is correct.</span>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setValidated(false)} disabled={saving}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-1.5 border-emerald-600/50 text-emerald-500 hover:bg-emerald-600/15 hover:text-emerald-400"
                onClick={() => setValidated(true)}
                disabled={saving}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark data as correct
              </Button>
            )}

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
