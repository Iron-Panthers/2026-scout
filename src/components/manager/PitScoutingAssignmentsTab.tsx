import { useState, useEffect, useCallback } from "react";
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
import { Loader2, X } from "lucide-react";
import { getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import {
  getPitAssignmentsForEvent,
  upsertPitAssignment,
  removePitAssignment,
} from "@/lib/pitScoutingAssignments";
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
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assigningTeam, setAssigningTeam] = useState<number | null>(null);

  const currentEvent = events.find((e) => e.id === selectedEvent);
  const isAllEvents = selectedEvent === "all";

  const loadData = useCallback(async () => {
    if (!currentEvent?.id) return;

    setLoadingTeams(true);
    try {
      const [teamsData, assignmentsData] = await Promise.all([
        currentEvent.event_code
          ? getEventTeams(currentEvent.event_code)
          : Promise.resolve([]),
        getPitAssignmentsForEvent(currentEvent.id),
      ]);

      // Sort teams by team number
      const sorted = [...teamsData].sort(
        (a, b) => a.team_number - b.team_number
      );
      setTeams(sorted);
      setAssignments(assignmentsData);
    } finally {
      setLoadingTeams(false);
    }
  }, [currentEvent?.id, currentEvent?.event_code]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      // Reload to get accurate state
      loadData();
    } else {
      // Reload to get real IDs
      loadData();
    }
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
                <TableHead className="font-semibold">Assigned Scout</TableHead>
                <TableHead className="w-32 text-right font-semibold">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const scout = getAssignedScout(team.team_number);
                return (
                  <TableRow key={team.team_number}>
                    <TableCell className="font-mono font-bold">
                      {team.team_number}
                    </TableCell>
                    <TableCell>{team.nickname}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {[team.city, team.state_prov]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {scout ? (
                        <Badge
                          variant="outline"
                          className="bg-green-900/20 text-green-400 border-green-600/30"
                        >
                          {scout.name || "Unknown"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Unassigned
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(team.team_number)}
                        >
                          Assign
                        </Button>
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
