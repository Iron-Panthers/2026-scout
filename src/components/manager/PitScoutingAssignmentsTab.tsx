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
import { Badge } from "@/components/ui/badge";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import { getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import {
  getPitAssignmentsForEvent,
  upsertPitAssignment,
  removePitAssignment,
} from "@/lib/pitScoutingAssignments";
import { getPitScoutingByEvent } from "@/lib/pitScouting";
import { ScoutAssignmentDialog } from "@/components/manager/ScoutAssignmentDialog";
import { useToast } from "@/hooks/use-toast";
import type { Event, Profile, PitScoutingAssignment } from "@/types";

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
  const [submittedTeams, setSubmittedTeams] = useState<Map<number, string>>(new Map());
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigningTeam, setAssigningTeam] = useState<number | null>(null);

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
    </div>
  );
}
