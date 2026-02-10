import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Roster, Profile, MatchAssignment } from "@/types";

interface ApplyRosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: Roster | null;
  availableScouts: Profile[];
  matches: MatchAssignment[];
  selectedMatches: Set<string>;
  onApply: (matchIds: string[]) => Promise<void>;
}

export function ApplyRosterDialog({
  open,
  onOpenChange,
  roster,
  availableScouts,
  matches,
  selectedMatches,
  onApply,
}: ApplyRosterDialogProps) {
  const [applyMode, setApplyMode] = useState<"range" | "selected">("range");
  const [fromMatch, setFromMatch] = useState("");
  const [toMatch, setToMatch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setApplyMode(selectedMatches.size > 0 ? "selected" : "range");
      setFromMatch("");
      setToMatch("");
      setError(null);
    }
  }, [open, selectedMatches.size]);

  const getMatchIdsFromRange = (): string[] => {
    const from = parseInt(fromMatch);
    const to = parseInt(toMatch);

    if (isNaN(from) || isNaN(to)) {
      setError("Please enter valid match numbers");
      return [];
    }

    if (from > to) {
      setError("'From' match must be less than or equal to 'To' match");
      return [];
    }

    const matchIds = matches
      .filter(
        (m) =>
          m.matchNumber >= from && m.matchNumber <= to && m.matchId
      )
      .map((m) => m.matchId!);

    if (matchIds.length === 0) {
      setError("No matches found in the specified range");
      return [];
    }

    return matchIds;
  };

  const getPreviewCount = (): number => {
    if (applyMode === "selected") {
      return selectedMatches.size;
    } else {
      const from = parseInt(fromMatch);
      const to = parseInt(toMatch);

      if (isNaN(from) || isNaN(to) || from > to) {
        return 0;
      }

      return matches.filter(
        (m) =>
          m.matchNumber >= from && m.matchNumber <= to && m.matchId
      ).length;
    }
  };

  const handleApply = async () => {
    if (!roster) return;

    setError(null);
    let matchIds: string[];

    if (applyMode === "selected") {
      matchIds = Array.from(selectedMatches);
    } else {
      matchIds = getMatchIdsFromRange();
      if (matchIds.length === 0) return;
    }

    setLoading(true);
    try {
      await onApply(matchIds);
      onOpenChange(false);
    } catch (err) {
      console.error("Error applying roster:", err);
      setError("Failed to apply roster. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Get scout name by ID
  const getScoutName = (scouterId: string | null): string => {
    if (!scouterId) return "Unassigned";
    const scout = availableScouts.find((s) => s.id === scouterId);
    return scout?.name || "Unknown";
  };

  const previewCount = getPreviewCount();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Roster</DialogTitle>
          <DialogDescription>
            Apply "{roster?.name}" to multiple matches at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Roster Preview */}
          {roster && (
            <div className="bg-muted p-3 rounded-md space-y-2">
              <div className="font-semibold text-sm">Roster Assignments:</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>Red 1: {getScoutName(roster.red1_scouter_id)}</div>
                <div>Blue 1: {getScoutName(roster.blue1_scouter_id)}</div>
                <div>Red 2: {getScoutName(roster.red2_scouter_id)}</div>
                <div>Blue 2: {getScoutName(roster.blue2_scouter_id)}</div>
                <div>Red 3: {getScoutName(roster.red3_scouter_id)}</div>
                <div>Blue 3: {getScoutName(roster.blue3_scouter_id)}</div>
                <div>Qual Red: {getScoutName(roster.qual_red_scouter_id)}</div>
                <div>Qual Blue: {getScoutName(roster.qual_blue_scouter_id)}</div>
              </div>
            </div>
          )}

          {/* Application Mode Selection */}
          <RadioGroup value={applyMode} onValueChange={(value) => setApplyMode(value as "range" | "selected")}>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="range" id="mode-range" />
                <Label htmlFor="mode-range" className="font-normal cursor-pointer">
                  Apply to match range
                </Label>
              </div>

              {selectedMatches.size > 0 && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="selected" id="mode-selected" />
                  <Label htmlFor="mode-selected" className="font-normal cursor-pointer">
                    Apply to selected matches ({selectedMatches.size})
                  </Label>
                </div>
              )}
            </div>
          </RadioGroup>

          {/* Match Range Inputs */}
          {applyMode === "range" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="from-match">From Match</Label>
                  <Input
                    id="from-match"
                    type="number"
                    value={fromMatch}
                    onChange={(e) => setFromMatch(e.target.value)}
                    placeholder="1"
                    disabled={loading}
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-match">To Match</Label>
                  <Input
                    id="to-match"
                    type="number"
                    value={toMatch}
                    onChange={(e) => setToMatch(e.target.value)}
                    placeholder="25"
                    disabled={loading}
                    min="1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {previewCount > 0 && (
            <div className="bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm p-3 rounded-md">
              <strong>Preview:</strong> This will update {previewCount} match
              {previewCount !== 1 ? "es" : ""}.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={loading || previewCount === 0}
          >
            {loading ? "Applying..." : `Apply to ${previewCount} Match${previewCount !== 1 ? "es" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
