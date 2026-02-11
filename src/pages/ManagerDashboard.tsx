import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Calendar,
  PlusCircle,
  ListChecks,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMatchesWithProfiles,
  getEvents,
  createEventWithMatches,
} from "@/lib/matches";
import { updateMatchAssignment } from "@/lib/matches";
import { getRostersForEvent, applyRosterToMatches } from "@/lib/rosters";
import { supabase } from "@/lib/supabase";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import { MatchRow } from "@/components/manager/MatchRow";
import { EventInformationTab } from "@/components/manager/EventInformationTab";
import { CreateEventTab } from "@/components/manager/CreateEventTab";
import { ScoutAssignmentDialog } from "@/components/manager/ScoutAssignmentDialog";
import { RosterManagementTab } from "@/components/manager/RosterManagementTab";
import type {
  Profile,
  Role,
  MatchAssignment,
  SelectedCell,
  Scout,
  Event,
  Match,
  Roster,
} from "@/types";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Manager";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = user?.user_metadata?.avatar_url || "";

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

  // State for available scouts (converted from Profile to Scout format)
  const [availableScouts, setAvailableScouts] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("all");
  const [allDbMatches, setAllDbMatches] = useState<Match[]>([]);
  const [completedSubmissions, setCompletedSubmissions] = useState<Set<string>>(
    new Set()
  );
  const [actualScouters, setActualScouters] = useState<Map<string, string>>(
    new Map()
  ); // Map of "matchId:role" -> scouter_id

  // New event form state
  const [newEventName, setNewEventName] = useState("");
  const [newEventCode, setNewEventCode] = useState("");
  const [numQualMatches, setNumQualMatches] = useState("");
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);

  // Generate 100 matches with empty assignments
  const [matches, setMatches] = useState<MatchAssignment[]>(
    Array.from({ length: 100 }, (_, i) => ({
      matchNumber: i + 1,
      assignments: {},
    }))
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const matchesPerPage = 25;

  // Roster state
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  // Helper function to convert database match to assignment format
  const convertMatchToAssignment = useCallback(
    (match: Match): Partial<Record<Role, Scout>> => {
      const assignments: Partial<Record<Role, Scout>> = {};
      const roleMapping: Array<{ role: Role; scouterId: string | null }> = [
        { role: "red1", scouterId: match.red1_scouter_id },
        { role: "red2", scouterId: match.red2_scouter_id },
        { role: "red3", scouterId: match.red3_scouter_id },
        { role: "qualRed", scouterId: match.qual_red_scouter_id },
        { role: "blue1", scouterId: match.blue1_scouter_id },
        { role: "blue2", scouterId: match.blue2_scouter_id },
        { role: "blue3", scouterId: match.blue3_scouter_id },
        { role: "qualBlue", scouterId: match.qual_blue_scouter_id },
      ];

      roleMapping.forEach(({ role, scouterId }) => {
        if (scouterId) {
          const profile = availableScouts.find((p) => p.id === scouterId);
          if (profile) {
            assignments[role] = {
              id: profile.id,
              name: profile.name || "Unknown",
              initials: (profile.name || "U")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2),
              avatar: "",
            };
          }
        }
      });

      return assignments;
    },
    [availableScouts]
  );

  // Load available scouts and existing match assignments from database
  const loadData = useCallback(async () => {
    try {
      const [{ matches: dbMatches, profiles }, eventsData] = await Promise.all([
        getMatchesWithProfiles(),
        getEvents(),
      ]);
      const profilesArray = Array.from(profiles.values());
      setAvailableScouts(profilesArray);
      setEvents(eventsData);
      setAllDbMatches(dbMatches);

      // Set the most recently created event as default
      if (eventsData.length > 0) {
        // Events are already sorted by start_date descending from getEvents()
        if (eventsData.filter((a) => a.is_active).length > 0) {
          setSelectedEvent(eventsData.filter((a) => a.is_active)[0].id);
        } else {
          setSelectedEvent(eventsData[0].id);
        }
      }

      // Convert database matches to component format inline
      setMatches(
        dbMatches.map((match) => {
          const assignments: Partial<Record<Role, Scout>> = {};
          const roleMapping: Array<{ role: Role; scouterId: string | null }> = [
            { role: "red1", scouterId: match.red1_scouter_id },
            { role: "red2", scouterId: match.red2_scouter_id },
            { role: "red3", scouterId: match.red3_scouter_id },
            { role: "qualRed", scouterId: match.qual_red_scouter_id },
            { role: "blue1", scouterId: match.blue1_scouter_id },
            { role: "blue2", scouterId: match.blue2_scouter_id },
            { role: "blue3", scouterId: match.blue3_scouter_id },
            { role: "qualBlue", scouterId: match.qual_blue_scouter_id },
          ];

          roleMapping.forEach(({ role, scouterId }) => {
            if (scouterId && profiles.has(scouterId)) {
              const profile = profiles.get(scouterId)!;
              assignments[role] = {
                id: profile.id,
                name: profile.name || "Unknown",
                initials: (profile.name || "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2),
                avatar: "",
              };
            }
          });

          return {
            matchNumber: match.match_number,
            matchId: match.id,
            assignments,
          };
        })
      );
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load rosters for selected event
  const loadRosters = useCallback(async () => {
    if (selectedEvent === "all") {
      setRosters([]);
      return;
    }
    const rostersData = await getRostersForEvent(selectedEvent);
    setRosters(rostersData);
  }, [selectedEvent]);

  useEffect(() => {
    loadRosters();
  }, [loadRosters]);

  // Filter matches based on selected event
  useEffect(() => {
    const filteredDbMatches =
      selectedEvent === "all"
        ? allDbMatches
        : allDbMatches.filter((match) => match.event_id === selectedEvent);

    setMatches(
      filteredDbMatches.map((match) => ({
        matchNumber: match.match_number,
        matchId: match.id,
        assignments: convertMatchToAssignment(match),
      }))
    );

    // Reset to page 1 when event changes
    setCurrentPage(1);

    // Load submission status for filtered matches
    loadSubmissionStatus(filteredDbMatches);
  }, [selectedEvent, allDbMatches, convertMatchToAssignment]);

  // Load submission status for all match/role combinations
  const loadSubmissionStatus = async (dbMatches: Match[]) => {
    if (dbMatches.length === 0) {
      setCompletedSubmissions(new Set());
      setActualScouters(new Map());
      return;
    }

    try {
      const matchIds = dbMatches.map((m) => m.id);
      const { data: submissions, error } = await supabase
        .from("scouting_submissions")
        .select("match_id, role, scouter_id")
        .in("match_id", matchIds);

      if (error) throw error;

      // Create Set of "matchId:role" strings for quick lookup
      const completedSet = new Set(
        (submissions || []).map((s) => `${s.match_id}:${s.role}`)
      );

      // Create Map of "matchId:role" -> scouter_id
      const scoutersMap = new Map(
        (submissions || []).map((s) => [`${s.match_id}:${s.role}`, s.scouter_id])
      );

      setCompletedSubmissions(completedSet);
      setActualScouters(scoutersMap);
    } catch (error) {
      console.error("Error loading submission status:", error);
    }
  };

  // Calculate pagination
  const totalPages = Math.ceil(matches.length / matchesPerPage);
  const startIndex = (currentPage - 1) * matchesPerPage;
  const endIndex = startIndex + matchesPerPage;
  const paginatedMatches = matches.slice(startIndex, endIndex);

  const handleAssignScout = useCallback(
    async (profile: Profile) => {
      if (!selectedCell) return;

      // Update local state immediately for responsive UI
      setMatches((prevMatches) =>
        prevMatches.map((match) =>
          match.matchNumber === selectedCell.matchNumber
            ? {
                ...match,
                assignments: {
                  ...match.assignments,
                  [selectedCell.role]: {
                    id: profile.id,
                    name: profile.name || "Unknown",
                    initials: (profile.name || "U")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2),
                    avatar: "",
                  },
                },
              }
            : match
        )
      );

      // Persist to database
      try {
        const currentMatch = matches.find(
          (m) => m.matchNumber === selectedCell.matchNumber
        );
        if (!currentMatch?.matchId) {
          console.error(
            "Match ID not found for match number:",
            selectedCell.matchNumber
          );
          return;
        }
        await updateMatchAssignment(
          currentMatch.matchId,
          selectedCell.role,
          profile.id
        );
      } catch (error) {
        console.error("Failed to update match assignment:", error);
        // TODO: Show error toast/notification to user
      }

      setDialogOpen(false);
      setSelectedCell(null);
    },
    [selectedCell]
  );

  const openAssignmentDialog = useCallback(
    (matchNumber: number, role: Role) => {
      setSelectedCell({ matchNumber, role });
      setDialogOpen(true);
    },
    []
  );

  const handleClearAssignment = useCallback(
    async (matchNumber: number, role: Role) => {
      // Update local state immediately
      setMatches((prevMatches) =>
        prevMatches.map((match) =>
          match.matchNumber === matchNumber
            ? {
                ...match,
                assignments: {
                  ...match.assignments,
                  [role]: null,
                },
              }
            : match
        )
      );

      // Persist to database
      try {
        const currentMatch = matches.find((m) => m.matchNumber === matchNumber);
        if (!currentMatch?.matchId) {
          console.error("Match ID not found for match number:", matchNumber);
          return;
        }
        await updateMatchAssignment(currentMatch.matchId, role, null);
      } catch (error) {
        console.error("Failed to clear match assignment:", error);
      }
    },
    [matches]
  );

  // Match selection handlers
  const handleToggleMatch = useCallback((matchId: string) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }, []);

  const handleToggleAllMatches = useCallback(() => {
    setSelectedMatches((prev) => {
      const allMatchIds = paginatedMatches
        .filter((m) => m.matchId)
        .map((m) => m.matchId!);

      if (prev.size === allMatchIds.length && allMatchIds.length > 0) {
        // All selected, deselect all
        return new Set();
      } else {
        // Select all on current page
        return new Set(allMatchIds);
      }
    });
  }, [paginatedMatches]);

  const handleQuickApplyToSelected = useCallback(
    async (rosterId: string) => {
      if (selectedMatches.size === 0) return;

      const matchIds = Array.from(selectedMatches);
      const result = await applyRosterToMatches(rosterId, matchIds);

      if (result.success) {
        // Reload data to show updated assignments
        await loadData();
        setSelectedMatches(new Set());
      } else {
        alert(result.error || "Failed to apply roster");
      }
    },
    [selectedMatches, loadData]
  );

  const handleCreateEvent = async () => {
    if (!newEventName.trim() || !newEventCode.trim() || !numQualMatches) {
      alert("Please fill in all fields");
      return;
    }

    const numMatches = parseInt(numQualMatches);
    if (isNaN(numMatches) || numMatches <= 0) {
      alert("Please enter a valid number of matches");
      return;
    }

    setIsCreatingEvent(true);
    try {
      const result = await createEventWithMatches(
        newEventName.trim(),
        newEventCode.trim(),
        numMatches
      );

      if (result.success) {
        // Reload events and matches
        const [eventsData, { matches: dbMatches, profiles }] =
          await Promise.all([getEvents(), getMatchesWithProfiles()]);
        setEvents(eventsData);

        // Update matches state
        const matchAssignmentsMap = new Map<
          number,
          Partial<Record<Role, Scout>>
        >();
        dbMatches.forEach((match) => {
          const assignments: Partial<Record<Role, Scout>> = {};
          const roleMapping: Array<{ role: Role; scouterId: string | null }> = [
            { role: "red1", scouterId: match.red1_scouter_id },
            { role: "red2", scouterId: match.red2_scouter_id },
            { role: "red3", scouterId: match.red3_scouter_id },
            { role: "qualRed", scouterId: match.qual_red_scouter_id },
            { role: "blue1", scouterId: match.blue1_scouter_id },
            { role: "blue2", scouterId: match.blue2_scouter_id },
            { role: "blue3", scouterId: match.blue3_scouter_id },
            { role: "qualBlue", scouterId: match.qual_blue_scouter_id },
          ];

          roleMapping.forEach(({ role, scouterId }) => {
            if (scouterId && profiles.has(scouterId)) {
              const profile = profiles.get(scouterId)!;
              assignments[role] = {
                id: profile.id,
                name: profile.name || "Unknown",
                initials: (profile.name || "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2),
                avatar: "",
              };
            }
          });

          matchAssignmentsMap.set(match.match_number, assignments);
        });

        setMatches((prevMatches) =>
          prevMatches.map((match) => ({
            ...match,
            assignments: matchAssignmentsMap.get(match.matchNumber) || {},
          }))
        );

        // Reset form
        setNewEventName("");
        setNewEventCode("");
        setNumQualMatches("");
        alert(`Event "${newEventName}" created with ${numMatches} matches!`);
      } else {
        alert(`Failed to create event: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating event:", error);
      alert("An error occurred while creating the event");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const getRoleHeaderColor = (role: Role) => {
    if (role.startsWith("red") || role === "qualRed") {
      return "bg-red-900/30 text-red-400";
    }
    return "bg-blue-900/30 text-blue-400";
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-4 md:p-6 max-w-[1600px]">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <DashboardHeader
            userName={userName}
            subtitle="Manage scout assignments for the competition"
          />
          <UserProfileMenu
            userName={userName}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
          />
        </div>

        {/* Tabs for Navigation */}
        <Tabs defaultValue="assignments" className="w-full">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <TabsList className="grid w-full max-w-3xl grid-cols-2 md:grid-cols-4 gap-1">
              <TabsTrigger
                value="assignments"
                className="flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-3"
              >
                <Users className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Match </span>Assignments
              </TabsTrigger>
              <TabsTrigger value="rosters" className="flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-3">
                <ListChecks className="h-3 w-3 md:h-4 md:w-4" />
                Rosters
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-3">
                <Calendar className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Event </span>Info
              </TabsTrigger>
              <TabsTrigger value="create" className="flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-3">
                <PlusCircle className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Create </span>Event
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Event:</span>
              <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Match Assignments Tab */}
          <TabsContent value="assignments" className="mt-0">
            {/* Assignment Table */}
            <div className="rounded-lg border border-border bg-card">
              <div className="p-4 border-b border-border">
                <h2 className="text-2xl font-bold">Match Assignments</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Click the checkmark to assign a scout to a role
                </p>
              </div>

              {/* Bulk Apply Action Bar */}
              {selectedMatches.size > 0 && (
                <div className="p-3 bg-accent/50 border-b flex items-center justify-between">
                  <span className="text-sm">
                    {selectedMatches.size} match{selectedMatches.size !== 1 ? "es" : ""} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedMatches(new Set())}
                    >
                      Clear Selection
                    </Button>
                    <Select onValueChange={handleQuickApplyToSelected}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Apply roster..." />
                      </SelectTrigger>
                      <SelectContent>
                        {rosters.map((roster) => (
                          <SelectItem key={roster.id} value={roster.id}>
                            {roster.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="overflow-auto max-h-[70vh]">
                <Table noWrapper>
                  <TableHeader className="sticky top-0 bg-card z-20 shadow-sm">
                    <TableRow>
                      <TableHead className="w-12 border-r border-border">
                        <Checkbox
                          checked={
                            selectedMatches.size === paginatedMatches.filter((m) => m.matchId).length &&
                            paginatedMatches.filter((m) => m.matchId).length > 0
                          }
                          onCheckedChange={handleToggleAllMatches}
                        />
                      </TableHead>
                      <TableHead className="w-28 md:w-32 text-xs md:text-sm font-semibold border-r border-border">
                        Match
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "red1"
                        )}`}
                      >
                        Red 1
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "red2"
                        )}`}
                      >
                        Red 2
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "red3"
                        )}`}
                      >
                        Red 3
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "qualRed"
                        )}`}
                      >
                        Qual Red
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "blue1"
                        )}`}
                      >
                        Blue 1
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "blue2"
                        )}`}
                      >
                        Blue 2
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "blue3"
                        )}`}
                      >
                        Blue 3
                      </TableHead>
                      <TableHead
                        className={`w-28 md:w-32 text-xs md:text-sm font-semibold text-center ${getRoleHeaderColor(
                          "qualBlue"
                        )}`}
                      >
                        Qual Blue
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMatches.map((match, index) => (
                      <MatchRow
                        key={`${selectedEvent}-${match.matchNumber}-${
                          startIndex + index
                        }`}
                        match={match}
                        roles={roles}
                        onOpenDialog={openAssignmentDialog}
                        onClearAssignment={handleClearAssignment}
                        completedSubmissions={completedSubmissions}
                        actualScouters={actualScouters}
                        availableScouts={availableScouts}
                        isSelected={selectedMatches.has(match.matchId || "")}
                        onToggleSelect={handleToggleMatch}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination Controls */}
              <div className="p-4 border-t border-border flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, matches.length)}{" "}
                  of {matches.length} matches
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 md:mr-1" />
                    <span className="hidden md:inline">Previous</span>
                  </Button>
                  <div className="text-sm font-medium">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    <span className="hidden md:inline">Next</span>
                    <ChevronRight className="h-4 w-4 md:ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Rosters Tab */}
          <TabsContent value="rosters" className="mt-0">
            <RosterManagementTab
              selectedEvent={selectedEvent}
              events={events}
              availableScouts={availableScouts}
              rosters={rosters}
              matches={matches}
              selectedMatches={selectedMatches}
              onRosterChange={() => {
                loadRosters();
                loadData(); // Reload match data to show updated assignments
              }}
            />
          </TabsContent>

          {/* Event Information Tab */}
          <TabsContent value="events" className="mt-0">
            <EventInformationTab
              selectedEvent={selectedEvent}
              events={events}
              matches={matches}
              availableScouts={availableScouts}
              onEventUpdate={loadData}
            />
          </TabsContent>

          {/* Create Event Tab */}
          <TabsContent value="create" className="mt-0">
            <CreateEventTab
              newEventName={newEventName}
              setNewEventName={setNewEventName}
              newEventCode={newEventCode}
              setNewEventCode={setNewEventCode}
              numQualMatches={numQualMatches}
              setNumQualMatches={setNumQualMatches}
              isCreatingEvent={isCreatingEvent}
              onCreateEvent={handleCreateEvent}
            />
          </TabsContent>
        </Tabs>

        {/* Assignment Dialog */}
        <ScoutAssignmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          availableScouts={availableScouts}
          onAssignScout={handleAssignScout}
        />
      </main>
    </div>
  );
}
