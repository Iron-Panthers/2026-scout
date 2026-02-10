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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRoster, updateRoster } from "@/lib/rosters";
import type { Roster, Profile, Role, MatchAssignment } from "@/types";

interface RosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  roster?: Roster | null;
  eventId: string;
  availableScouts: Profile[];
  matches?: MatchAssignment[]; // For "Save from Match" feature
  onSave: () => void;
}

const roles: Role[] = [
  "red1",
  "red2",
  "red3",
  "qualRed",
  "blue1",
  "blue2",
  "blue3",
  "qualBlue",
];

const roleLabels: Record<Role, string> = {
  red1: "Red 1",
  red2: "Red 2",
  red3: "Red 3",
  qualRed: "Qual Red",
  blue1: "Blue 1",
  blue2: "Blue 2",
  blue3: "Blue 3",
  qualBlue: "Qual Blue",
};

export function RosterDialog({
  open,
  onOpenChange,
  mode,
  roster,
  eventId,
  availableScouts,
  matches = [],
  onSave,
}: RosterDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignments, setAssignments] = useState<
    Partial<Record<Role, string | null>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveFromMatch, setShowSaveFromMatch] = useState(false);

  // Initialize form when roster changes
  useEffect(() => {
    if (mode === "edit" && roster) {
      setName(roster.name);
      setDescription(roster.description || "");

      // Map roster scout IDs to assignments
      const rosterAssignments: Partial<Record<Role, string | null>> = {};
      roles.forEach((role) => {
        const column = `${role === "qualRed" ? "qual_red" : role === "qualBlue" ? "qual_blue" : role}_scouter_id` as keyof Roster;
        rosterAssignments[role] = (roster[column] as string) || null;
      });
      setAssignments(rosterAssignments);
    } else {
      setName("");
      setDescription("");
      setAssignments({});
    }
    setError(null);
    setShowSaveFromMatch(false);
  }, [mode, roster, open]);

  const handleSaveFromMatch = (matchNumber: number) => {
    const match = matches.find((m) => m.matchNumber === matchNumber);
    if (!match) return;

    const newAssignments: Partial<Record<Role, string | null>> = {};
    roles.forEach((role) => {
      const scout = match.assignments[role];
      newAssignments[role] = scout?.id || null;
    });
    setAssignments(newAssignments);
    setShowSaveFromMatch(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Roster name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === "create") {
        const result = await createRoster(
          name.trim(),
          eventId,
          description.trim(),
          assignments
        );

        if (!result.success) {
          setError(result.error || "Failed to create roster");
          setLoading(false);
          return;
        }
      } else if (mode === "edit" && roster) {
        const result = await updateRoster(roster.id, {
          name: name.trim(),
          description: description.trim(),
          assignments,
        });

        if (!result.success) {
          setError(result.error || "Failed to update roster");
          setLoading(false);
          return;
        }
      }

      setLoading(false);
      onSave();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving roster:", err);
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create New Roster" : "Edit Roster"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a roster template to quickly assign scouts to multiple matches."
              : "Update the roster name, description, or scout assignments."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="roster-name">
              Roster Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="roster-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Squad, Saturday Crew"
              disabled={loading}
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <Label htmlFor="roster-description">Description (Optional)</Label>
            <Textarea
              id="roster-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this roster..."
              rows={2}
              disabled={loading}
            />
          </div>

          {/* Save from Match Button */}
          {matches.length > 0 && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSaveFromMatch(!showSaveFromMatch)}
                disabled={loading}
              >
                {showSaveFromMatch ? "Cancel" : "Copy from Match"}
              </Button>

              {showSaveFromMatch && (
                <Select
                  onValueChange={(value) => handleSaveFromMatch(parseInt(value))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a match to copy assignments from..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matches.slice(0, 25).map((match) => (
                      <SelectItem
                        key={match.matchNumber}
                        value={match.matchNumber.toString()}
                      >
                        Match {match.matchNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Scout Assignments */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Scout Assignments</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roles.map((role) => (
                <div key={role} className="space-y-1.5">
                  <Label htmlFor={`roster-${role}`} className="text-xs">
                    {roleLabels[role]}
                  </Label>
                  <Select
                    value={assignments[role] || "none"}
                    onValueChange={(value) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [role]: value === "none" ? null : value,
                      }))
                    }
                    disabled={loading}
                  >
                    <SelectTrigger id={`roster-${role}`} className="h-9">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {availableScouts.map((scout) => (
                        <SelectItem key={scout.id} value={scout.id}>
                          {scout.name || "Unknown"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading
              ? "Saving..."
              : mode === "create"
              ? "Create Roster"
              : "Update Roster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
