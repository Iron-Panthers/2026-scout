import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Play } from "lucide-react";
import { RosterDialog } from "./RosterDialog";
import { ApplyRosterDialog } from "./ApplyRosterDialog";
import { deleteRoster, applyRosterToMatches } from "@/lib/rosters";
import type { Roster, Profile, Event, MatchAssignment } from "@/types";

interface RosterManagementTabProps {
  selectedEvent: string;
  events: Event[];
  availableScouts: Profile[];
  rosters: Roster[];
  matches: MatchAssignment[];
  selectedMatches: Set<string>;
  onRosterChange: () => void;
}

export function RosterManagementTab({
  selectedEvent,
  events,
  availableScouts,
  rosters,
  matches,
  selectedMatches,
  onRosterChange,
}: RosterManagementTabProps) {
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [selectedRoster, setSelectedRoster] = useState<Roster | null>(null);

  const currentEvent = events.find((e) => e.id === selectedEvent);

  const handleCreateNew = () => {
    setSelectedRoster(null);
    setDialogMode("create");
    setRosterDialogOpen(true);
  };

  const handleEdit = (roster: Roster) => {
    setSelectedRoster(roster);
    setDialogMode("edit");
    setRosterDialogOpen(true);
  };

  const handleApply = (roster: Roster) => {
    setSelectedRoster(roster);
    setApplyDialogOpen(true);
  };

  const handleDeleteClick = (roster: Roster) => {
    setSelectedRoster(roster);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRoster) return;

    const result = await deleteRoster(selectedRoster.id);
    if (result.success) {
      onRosterChange();
    } else {
      alert(result.error || "Failed to delete roster");
    }
    setDeleteDialogOpen(false);
    setSelectedRoster(null);
  };

  const handleApplyRoster = async (matchIds: string[]) => {
    if (!selectedRoster) return;

    const result = await applyRosterToMatches(selectedRoster.id, matchIds);
    if (result.success) {
      onRosterChange(); // Refresh to show updated assignments
    } else {
      throw new Error(result.error || "Failed to apply roster");
    }
  };

  // Get scout initials by ID
  const getScoutInitials = (scouterId: string | null): string => {
    if (!scouterId) return "?";
    const scout = availableScouts.find((s) => s.id === scouterId);
    if (!scout || !scout.name) return "?";

    return scout.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (selectedEvent === "all") {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          Please select a specific event to manage rosters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 md:p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Roster Management</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage scout assignment templates for{" "}
              {currentEvent?.name || "this event"}
            </p>
          </div>
          <Button onClick={handleCreateNew}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Create Roster
          </Button>
        </div>

        {/* Roster Cards Grid */}
        <div className="p-4 md:p-6">
          {rosters.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No rosters created yet. Create your first roster to save scout
                assignment templates.
              </p>
              <Button onClick={handleCreateNew} variant="outline">
                <PlusCircle className="h-4 w-4 mr-2" />
                Create First Roster
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rosters.map((roster) => (
                <Card key={roster.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{roster.name}</CardTitle>
                    {roster.description && (
                      <CardDescription className="text-xs">
                        {roster.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Scout Avatars Preview */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        Assignments:
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {/* Red Team */}
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-red-900/30">
                            <AvatarFallback className="text-[9px] text-red-400">
                              {getScoutInitials(roster.red1_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">R1</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-red-900/30">
                            <AvatarFallback className="text-[9px] text-red-400">
                              {getScoutInitials(roster.red2_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">R2</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-red-900/30">
                            <AvatarFallback className="text-[9px] text-red-400">
                              {getScoutInitials(roster.red3_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">R3</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-red-900/30">
                            <AvatarFallback className="text-[9px] text-red-400">
                              {getScoutInitials(roster.qual_red_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">QR</div>
                        </div>

                        {/* Blue Team */}
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-blue-900/30">
                            <AvatarFallback className="text-[9px] text-blue-400">
                              {getScoutInitials(roster.blue1_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">B1</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-blue-900/30">
                            <AvatarFallback className="text-[9px] text-blue-400">
                              {getScoutInitials(roster.blue2_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">B2</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-blue-900/30">
                            <AvatarFallback className="text-[9px] text-blue-400">
                              {getScoutInitials(roster.blue3_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">B3</div>
                        </div>
                        <div className="space-y-1">
                          <Avatar className="h-6 w-6 bg-blue-900/30">
                            <AvatarFallback className="text-[9px] text-blue-400">
                              {getScoutInitials(roster.qual_blue_scouter_id)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-[9px] text-muted-foreground">QB</div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApply(roster)}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Apply
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(roster)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(roster)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Roster Dialog */}
      <RosterDialog
        open={rosterDialogOpen}
        onOpenChange={setRosterDialogOpen}
        mode={dialogMode}
        roster={selectedRoster}
        eventId={selectedEvent}
        availableScouts={availableScouts}
        matches={matches}
        onSave={onRosterChange}
      />

      {/* Apply Roster Dialog */}
      <ApplyRosterDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        roster={selectedRoster}
        availableScouts={availableScouts}
        matches={matches}
        selectedMatches={selectedMatches}
        onApply={handleApplyRoster}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Roster</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedRoster?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
