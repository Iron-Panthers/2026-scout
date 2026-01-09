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
import {
  ChevronLeft,
  ChevronRight,
  Users,
  Calendar,
  PlusCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMatchesWithProfiles,
  getEvents,
  createEventWithMatches,
} from "@/lib/matches";
import { updateMatchAssignment } from "@/lib/matches";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import { MatchRow } from "@/components/manager/MatchRow";
import { EventInformationTab } from "@/components/manager/EventInformationTab";
import { CreateEventTab } from "@/components/manager/CreateEventTab";
import { ScoutAssignmentDialog } from "@/components/manager/ScoutAssignmentDialog";
import type {
  Profile,
  Role,
  MatchAssignment,
  SelectedCell,
  Scout,
  Event,
  Match,
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

  // New event form state
  const [newEventName, setNewEventName] = useState("");
  const [newEventId, setNewEventId] = useState("");
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
        setSelectedEvent(eventsData[0].id);
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
  }, [selectedEvent, allDbMatches, convertMatchToAssignment]);

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

  const handleCreateEvent = async () => {
    if (!newEventName.trim() || !newEventId.trim() || !numQualMatches) {
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
        newEventId.trim(),
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
        setNewEventId("");
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
      <main className="container mx-auto p-6 max-w-[1600px]">
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
          <div className="flex items-center justify-between mb-6">
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger
                value="assignments"
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Match Assignments
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Event Information
              </TabsTrigger>
              <TabsTrigger value="create" className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                Create Event
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
              <div className="overflow-auto max-h-[70vh]">
                <Table noWrapper>
                  <TableHeader className="sticky top-0 bg-card z-20 shadow-sm">
                    <TableRow>
                      <TableHead className="w-32 font-semibold border-r border-border">
                        Match
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "red1"
                        )}`}
                      >
                        Red 1
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "red2"
                        )}`}
                      >
                        Red 2
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "red3"
                        )}`}
                      >
                        Red 3
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "qualRed"
                        )}`}
                      >
                        Qual Red
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "blue1"
                        )}`}
                      >
                        Blue 1
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "blue2"
                        )}`}
                      >
                        Blue 2
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
                          "blue3"
                        )}`}
                      >
                        Blue 3
                      </TableHead>
                      <TableHead
                        className={`w-32 font-semibold text-center ${getRoleHeaderColor(
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
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
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
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
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
              newEventId={newEventId}
              setNewEventId={setNewEventId}
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
