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
import { Checkbox } from "@/components/ui/checkbox";
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
import CosmeticAvatar from "@/components/CosmeticAvatar";

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
  const [assignments2, setAssignments2] = useState<
    Partial<Record<Role, string | null>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSaveFromMatch, setShowSaveFromMatch] = useState(false);
  const [scoutSearch, setScoutSearch] = useState("");
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);

  const getScoutName = (scoutId: string | null | undefined) =>
    availableScouts.find((scout) => scout.id === scoutId)?.name || "";

  // Initialize form when roster changes
  useEffect(() => {
    if (mode === "edit" && roster) {
      setName(roster.name);
      setDescription(roster.description || "");

      // Map roster scout IDs to assignments
      const rosterAssignments: Partial<Record<Role, string | null>> = {};
      const rosterAssignments2: Partial<Record<Role, string | null>> = {};
      roles.forEach((role) => {
        const base = role === "qualRed" ? "qual_red" : role === "qualBlue" ? "qual_blue" : role;
        const column = `${base}_scouter_id` as keyof Roster;
        const column2 = `${base}_scouter_id_2` as keyof Roster;
        rosterAssignments[role] = (roster[column] as string) || null;
        rosterAssignments2[role] = (roster[column2] as string) || null;
      });
      setAssignments(rosterAssignments);
      setAssignments2(rosterAssignments2);
    } else {
      setName("");
      setDescription("");
      setAssignments({});
      setAssignments2({});
    }
    setScoutSearch("");
    setError(null);
    setShowSaveFromMatch(false);
    setActiveRole(null);
    setActiveSlot(1);
  }, [mode, roster, open]);

  const handleSaveFromMatch = (matchNumber: number) => {
    const match = matches.find((m) => m.matchNumber === matchNumber);
    if (!match) return;

    const newAssignments: Partial<Record<Role, string | null>> = {};
    const newAssignments2: Partial<Record<Role, string | null>> = {};
    roles.forEach((role) => {
      const scout = match.assignments[role];
      newAssignments[role] = scout?.id || null;
      const scout2 = match.assignments2?.[role];
      newAssignments2[role] = scout2?.id || null;
    });
    setAssignments(newAssignments);
    setAssignments2(newAssignments2);
    setShowSaveFromMatch(false);
    setActiveRole(null);
  };

  const filteredScouts = availableScouts.filter((scout) =>
    `${scout.name || ""} ${scout.role}`.toLowerCase().includes(scoutSearch.trim().toLowerCase())
  );

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
          assignments,
          assignments2
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
          assignments2,
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
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {mode === "create" ? "Create New Roster" : "Edit Roster"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a roster template to quickly assign scouts to multiple matches."
              : "Update the roster name, description, or scout assignments."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
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
                <div key={role} className="space-y-2 rounded-lg border border-border p-3">
                  <Label className="text-xs font-semibold">{roleLabels[role]}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-full ${!assignments[role] ? "border-muted-foreground/30 bg-muted text-muted-foreground hover:bg-muted/80" : ""}`}
                    onClick={() => {
                      setActiveRole(role);
                      setActiveSlot(1);
                      setScoutSearch("");
                    }}
                    disabled={loading}
                  >
                    {assignments[role] ? getScoutName(assignments[role]) : "Assign Role"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`w-full text-xs ${!assignments2[role] ? "border-muted-foreground/30 bg-muted text-muted-foreground hover:bg-muted/80" : ""}`}
                    onClick={() => {
                      setActiveRole(role);
                      setActiveSlot(2);
                      setScoutSearch("");
                    }}
                    disabled={loading}
                  >
                    {assignments2[role] ? getScoutName(assignments2[role]) : "Assign Co-Scout"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Dialog open={activeRole !== null} onOpenChange={(open) => !open && setActiveRole(null)}>
          <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>
                Assign {activeRole ? roleLabels[activeRole] : "Role"}
                {activeSlot === 2 ? " (Co-Scout)" : ""}
              </DialogTitle>
              <DialogDescription>
                {activeSlot === 2
                  ? "Select a second scouter to co-scout this role alongside the primary."
                  : "Select a scouter for this role."}
              </DialogDescription>
            </DialogHeader>
            <Input
              value={scoutSearch}
              onChange={(event) => setScoutSearch(event.target.value)}
              placeholder="Search scouters..."
              aria-label="Search scouters"
              disabled={loading}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="rounded-md border border-border p-3 text-left text-sm hover:bg-accent/50"
                  onClick={() => {
                    if (activeRole) {
                      const setter = activeSlot === 2 ? setAssignments2 : setAssignments;
                      setter((previous) => ({ ...previous, [activeRole]: null }));
                    }
                    setActiveRole(null);
                  }}
                  disabled={loading}
                >
                  Unassigned
                </button>
                {filteredScouts.map((scout) => {
                  const currentAssignments = activeSlot === 2 ? assignments2 : assignments;
                  const selected = activeRole ? currentAssignments[activeRole] === scout.id : false;
                  const initials = (scout.name || "U")
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2);
                  return (
                    <label
                      key={scout.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 transition-colors ${selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"}`}
                    >
                      <Checkbox
                        checked={selected}
                        className="rounded-full"
                        onCheckedChange={() => {
                          if (activeRole) {
                            const setter = activeSlot === 2 ? setAssignments2 : setAssignments;
                            setter((previous) => ({ ...previous, [activeRole]: selected ? null : scout.id }));
                          }
                          if (!selected) setActiveRole(null);
                        }}
                        disabled={loading}
                        aria-label={`Assign ${scout.name || "scouter"}`}
                      />
                      <CosmeticAvatar initials={initials} avatarUrl={scout.avatar_url} size="sm" />
                      <span className="min-w-0 truncate text-sm font-medium">{scout.name || "Unknown"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <DialogFooter className="shrink-0 border-t bg-background pt-4">
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
