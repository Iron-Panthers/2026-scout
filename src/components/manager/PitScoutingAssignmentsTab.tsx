import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, CheckCircle2, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import {
  getPitAssignmentsForEvent,
  upsertPitAssignment,
  removePitAssignment,
} from "@/lib/pitScoutingAssignments";
import { getPitScoutingByEvent } from "@/lib/pitScouting";
import { ScoutAssignmentDialog } from "@/components/manager/ScoutAssignmentDialog";
import { RecursiveJsonEditor } from "@/components/RecursiveJsonEditor";
import { useToast } from "@/hooks/use-toast";
import type { Event, Profile, PitScoutingAssignment } from "@/types";
import type { PitScoutingSubmission } from "@/types/pitScouting";

interface PitScoutingAssignmentsTabProps {
  selectedEvent: string;
  events: Event[];
  availableScouts: Profile[];
}

export function PitScoutingAssignmentsTab({
  selectedEvent,
  events,
  availableScouts,
}: PitScoutingAssignmentsTabProps) {
  const { toast } = useToast();
  const [teams, setTeams] = useState<TBATeamSimple[]>([]);
  const [assignments, setAssignments] = useState<PitScoutingAssignment[]>([]);
  const [submissions, setSubmissions] = useState<PitScoutingSubmission[]>([]);
  const [submittedTeams, setSubmittedTeams] = useState<Map<number, string>>(new Map());
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigningTeam, setAssigningTeam] = useState<number | null>(null);

  // Edit state
  const [editTarget, setEditTarget] = useState<PitScoutingSubmission | null>(null);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [editConfirming, setEditConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<PitScoutingSubmission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentEvent = events.find((e) => e.id === selectedEvent);
  const isAllEvents = selectedEvent === "all";

  const loadData = useCallback(async () => {
    if (!currentEvent?.id) return;

    setLoadingTeams(true);
    try {
      const [teamsData, assignmentsData, submissionsData] = await Promise.all([
        currentEvent.event_code
          ? getEventTeams(currentEvent.event_code)
          : Promise.resolve([]),
        getPitAssignmentsForEvent(currentEvent.id),
        getPitScoutingByEvent(currentEvent.id),
      ]);

      // Sort teams by team number
      const sorted = [...teamsData].sort(
        (a, b) => a.team_number - b.team_number
      );
      setTeams(sorted);
      setAssignments(assignmentsData);
      setSubmissions(submissionsData);
      setSubmittedTeams(new Map(submissionsData.map((s) => [s.team_num, s.scouter_name])));
    } finally {
      setLoadingTeams(false);
    }
  }, [currentEvent?.id, currentEvent?.event_code]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: reload when submissions or assignments change
  useEffect(() => {
    if (!currentEvent?.id) return;

    const channel = supabase
      .channel(`pit-manager-${currentEvent.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pit_scouting_submissions" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "pit_scouting_assignments" }, loadData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentEvent?.id, loadData]);

  const openAssignDialog = (teamNumber: number) => {
    setAssigningTeam(teamNumber);
    setDialogOpen(true);
  };

  const handleAssignScout = async (profile: Profile) => {
    if (assigningTeam === null || !currentEvent?.id) return;

    setDialogOpen(false);
    const teamNumber = assigningTeam;
    setAssigningTeam(null);

    // Optimistic update
    setAssignments((prev) => {
      const existing = prev.find((a) => a.team_number === teamNumber);
      if (existing) {
        return prev.map((a) =>
          a.team_number === teamNumber
            ? { ...a, scouter_id: profile.id }
            : a
        );
      }
      return [
        ...prev,
        {
          id: "optimistic",
          event_id: currentEvent.id,
          team_number: teamNumber,
          scouter_id: profile.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
    });

    const success = await upsertPitAssignment(
      currentEvent.id,
      teamNumber,
      profile.id
    );

    if (!success) {
      toast({
        title: "Assignment Failed",
        description: "Could not assign scout",
        variant: "destructive",
      });
      // Reload to revert to accurate state after failure
      loadData();
    }
    // On success, the realtime subscription fires loadData() to confirm
    // with real IDs — no explicit reload needed here
  };

  const handleClearAssignment = async (teamNumber: number) => {
    if (!currentEvent?.id) return;

    // Optimistic update
    setAssignments((prev) =>
      prev.filter((a) => a.team_number !== teamNumber)
    );

    const success = await removePitAssignment(currentEvent.id, teamNumber);

    if (!success) {
      toast({
        title: "Clear Failed",
        description: "Could not remove assignment",
        variant: "destructive",
      });
      loadData();
    }
  };

  // Edit handlers
  const handleEditClick = (teamNumber: number) => {
    const submission = submissions.find((s) => s.team_num === teamNumber);
    if (!submission) return;
    setEditTarget(submission);
    setEditData(submission.pit_data);
    setEditConfirming(false);
  };

  const handleEditConfirm = async () => {
    if (!editTarget) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("pit_scouting_submissions")
        .update({ pit_data: editData })
        .eq("id", editTarget.id);

      if (error) throw error;

      toast({
        title: "Saved",
        description: `Pit scouting data updated for team ${editTarget.team_num}.`,
      });
      setEditTarget(null);
      setEditConfirming(false);
      loadData();
    } catch (error) {
      console.error("Error updating pit scouting:", error);
      toast({
        title: "Save Failed",
        description: "Could not update this submission",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handlers
  const handleDeleteClick = (teamNumber: number) => {
    const submission = submissions.find((s) => s.team_num === teamNumber);
    if (!submission) return;
    setDeleteTarget(submission);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("pit_scouting_submissions")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: `Pit scouting submission for team ${deleteTarget.team_num} has been permanently deleted.`,
      });
      setDeleteTarget(null);
      loadData();
    } catch (error) {
      console.error("Error deleting pit scouting:", error);
      toast({
        title: "Delete Failed",
        description: "Could not delete this submission",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getAssignedScout = (teamNumber: number): Profile | undefined => {
    const assignment = assignments.find((a) => a.team_number === teamNumber);
    if (!assignment?.scouter_id) return undefined;
    return availableScouts.find((s) => s.id === assignment.scouter_id);
  };

  if (isAllEvents) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          Select a specific event to manage pit scouting assignments.
        </p>
      </div>
    );
  }

  if (!currentEvent?.event_code) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          This event does not have a TBA event code. Add one in Event
          Information to load teams.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pit Scouting Assignments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Assign scouts to teams for pit scouting at {currentEvent.name}
            {teams.length > 0 && (
              <span className="ml-2 text-green-400 font-medium">
                — {submittedTeams.size}/{teams.length} submitted
              </span>
            )}
          </p>
        </div>
        {loadingTeams && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {!loadingTeams && teams.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground">
            No teams found for event code{" "}
            <span className="font-mono">{currentEvent.event_code}</span>. The
            event may not be listed on TBA yet.
          </p>
        </div>
      )}

      {teams.length > 0 && (
        <div className="overflow-auto max-h-[70vh]">
          <Table noWrapper>
            <TableHeader className="sticky top-0 bg-card z-20 shadow-sm">
              <TableRow>
                <TableHead className="w-28 font-semibold">Team #</TableHead>
                <TableHead className="font-semibold">Team Name</TableHead>
                <TableHead className="font-semibold">Location</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-32 text-right font-semibold">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const scout = getAssignedScout(team.team_number);
                const submittedBy = submittedTeams.get(team.team_number);
                const isSubmitted = submittedBy !== undefined;
                return (
                  <TableRow
                    key={team.team_number}
                    className={isSubmitted ? "bg-green-950/30" : undefined}
                  >
                    <TableCell className="font-mono font-bold">
                      <div className="flex items-center gap-2">
                        {isSubmitted && (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        {team.team_number}
                      </div>
                    </TableCell>
                    <TableCell>{team.nickname}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {[team.city, team.state_prov]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {isSubmitted ? (
                          <Badge className="bg-green-700/30 text-green-400 border-green-600/40 border w-fit">
                            ✓ {submittedBy}
                          </Badge>
                        ) : scout ? (
                          <Badge
                            variant="outline"
                            className="bg-muted/30 text-foreground border-border w-fit"
                          >
                            {scout.name || "Unknown"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            Unassigned
                          </span>
                        )}
                        {isSubmitted && scout && (
                          <Badge className="bg-yellow-700/30 text-yellow-400 border-yellow-600/40 border w-fit">
                            Rescout: {scout.name || "Unknown"}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSubmitted && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(team.team_number)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit pit scouting data"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(team.team_number)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              title="Delete pit scouting submission"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {!isSubmitted && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignDialog(team.team_number)}
                          >
                            Assign
                          </Button>
                        )}
                        {isSubmitted && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-yellow-600/50 text-yellow-400 hover:bg-yellow-900/30"
                            onClick={() => openAssignDialog(team.team_number)}
                          >
                            Assign Rescout
                          </Button>
                        )}
                        {scout && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleClearAssignment(team.team_number)
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ScoutAssignmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setAssigningTeam(null);
        }}
        availableScouts={availableScouts}
        onAssignScout={handleAssignScout}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Pit Scouting Submission?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  You are about to permanently delete the pit scouting submission for{" "}
                  <strong className="text-foreground">
                    Team {deleteTarget?.team_num}
                  </strong>{" "}
                  submitted by{" "}
                  <strong className="text-foreground">
                    {deleteTarget?.scouter_name ?? "Unknown"}
                  </strong>
                  .
                </p>
                <p className="text-destructive font-medium">
                  This action cannot be undone and will remove the data from the database
                  immediately.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditConfirming(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editConfirming ? "Confirm Save" : "Edit Pit Scouting Data"}
            </DialogTitle>
            <DialogDescription>
              {editConfirming ? (
                <>
                  Confirm changes to pit scouting for{" "}
                  <strong>Team {editTarget?.team_num}</strong>. This will
                  overwrite the existing data immediately.
                </>
              ) : (
                <>
                  Team {editTarget?.team_num}
                  {editTarget?.scouter_name && (
                    <> · Submitted by {editTarget.scouter_name}</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {!editConfirming && (
            <div className="overflow-y-auto overflow-x-hidden max-h-[60vh] border border-border rounded-md px-5 pt-8 pb-5">
              <RecursiveJsonEditor
                value={editData}
                onChange={(newVal) => setEditData(newVal as Record<string, unknown>)}
              />
            </div>
          )}

          {editConfirming && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This will overwrite the existing pit scouting data. This action cannot be undone.
              </p>
            </div>
          )}

          <DialogFooter>
            {editConfirming ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditConfirming(false)}
                  disabled={isSaving}
                >
                  Back to Edit
                </Button>
                <Button onClick={handleEditConfirm} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Confirm Save"
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={() => setEditConfirming(true)}>Save Changes</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
