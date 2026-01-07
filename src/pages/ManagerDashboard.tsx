import { useState, memo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
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
import type {
  Profile,
  Role,
  MatchAssignment,
  SelectedCell,
  Scout,
  Event,
} from "@/types";

const getRoleCellColor = (role: Role) => {
  if (role.startsWith("red") || role === "qualRed") {
    return "bg-red-900/10 border-r border-red-900/30";
  }
  return "bg-blue-900/10 border-r border-blue-900/30";
};

// Memoized row component to prevent unnecessary re-renders
const MatchRow = memo(
  ({
    match,
    roles,
    onOpenDialog,
  }: {
    match: MatchAssignment;
    roles: Role[];
    onOpenDialog: (matchNumber: number, role: Role) => void;
  }) => {
    return (
      <TableRow>
        <TableCell className="font-mono font-semibold border-r border-border">
          Q-{match.matchNumber}
        </TableCell>
        {roles.map((role) => {
          const assignment = match.assignments[role];
          return (
            <TableCell key={role} className={`p-2 ${getRoleCellColor(role)}`}>
              {assignment ? (
                <button
                  onClick={() => onOpenDialog(match.matchNumber, role)}
                  className="flex flex-col items-center gap-1 hover:bg-accent/50 rounded-md p-2 transition-colors w-full"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={assignment.avatar} />
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {assignment.initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium text-center">
                    {assignment.name}
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenDialog(match.matchNumber, role)}
                    className="h-10 w-10"
                  >
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </TableCell>
          );
        })}
      </TableRow>
    );
  }
);

MatchRow.displayName = "MatchRow";

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

  // Load available scouts and existing match assignments from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [{ matches: dbMatches, profiles }, eventsData] =
          await Promise.all([getMatchesWithProfiles(), getEvents()]);
        setAvailableScouts(Array.from(profiles.values()));
        setEvents(eventsData);

        // Create a map of match numbers to their assignments
        const matchAssignmentsMap = new Map<
          number,
          Partial<Record<Role, Scout>>
        >();

        dbMatches.forEach((match) => {
          const assignments: Partial<Record<Role, Scout>> = {};

          // Map database columns to roles
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

        // Update matches state with loaded assignments
        setMatches((prevMatches) =>
          prevMatches.map((match) => ({
            ...match,
            assignments: matchAssignmentsMap.get(match.matchNumber) || {},
          }))
        );
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };
    loadData();
  }, []);

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
        const matchName = `Q-${selectedCell.matchNumber}`;
        await updateMatchAssignment(matchName, selectedCell.role, profile.id);
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
                    {paginatedMatches.map((match) => (
                      <MatchRow
                        key={match.matchNumber}
                        match={match}
                        roles={roles}
                        onOpenDialog={openAssignmentDialog}
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
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Current Event</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Event Name
                      </label>
                      <p className="text-lg font-semibold">
                        2026 Competition Season
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Location
                        </label>
                        <p className="text-lg">TBD</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Total Matches
                        </label>
                        <p className="text-lg font-semibold">100</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          Start Date
                        </label>
                        <p className="text-lg">TBD</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">
                          End Date
                        </label>
                        <p className="text-lg">TBD</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Team Statistics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <p className="text-3xl font-bold text-primary">
                        {availableScouts.length}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total Scouts
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-blue-500/10">
                      <p className="text-3xl font-bold text-blue-400">
                        {
                          matches.filter(
                            (m) => Object.keys(m.assignments).length > 0
                          ).length
                        }
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Assigned Matches
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-yellow-500/10">
                      <p className="text-3xl font-bold text-yellow-400">
                        {
                          matches.filter(
                            (m) => Object.keys(m.assignments).length === 0
                          ).length
                        }
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Unassigned Matches
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Scout List</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {availableScouts.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        No scouts available
                      </p>
                    ) : (
                      availableScouts.map((profile) => {
                        const initials = (profile.name || "U")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);
                        return (
                          <div
                            key={profile.id}
                            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-sm bg-primary/20 text-primary">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-medium">
                                {profile.name || "Unknown"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {profile.role}{" "}
                                {profile.is_manager && "• Manager"}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Create Event Tab */}
          <TabsContent value="create" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Create New Event</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="eventName">Event Name</Label>
                    <Input
                      id="eventName"
                      placeholder="e.g., 2026 Regional Championship"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eventId">Event ID</Label>
                    <Input
                      id="eventId"
                      placeholder="e.g., 2026-regional"
                      value={newEventId}
                      onChange={(e) => setNewEventId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      This will be used as a prefix for match names (e.g.,
                      2026-regional-Q1)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numMatches">
                      Number of Qualification Matches
                    </Label>
                    <Input
                      id="numMatches"
                      type="number"
                      min="1"
                      placeholder="e.g., 100"
                      value={numQualMatches}
                      onChange={(e) => setNumQualMatches(e.target.value)}
                    />
                  </div>

                  <Button
                    onClick={handleCreateEvent}
                    disabled={isCreatingEvent}
                    className="w-full"
                    size="lg"
                  >
                    {isCreatingEvent ? (
                      "Creating Event..."
                    ) : (
                      <>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Create Event and Matches
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <h4 className="font-semibold text-sm">
                      What happens when you create an event?
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>A new event entry will be created in the database</li>
                      <li>
                        The specified number of qualification matches will be
                        generated
                      </li>
                      <li>Matches will be named: [Event ID]-Q[Match Number]</li>
                      <li>
                        The event will appear in the event selector dropdown
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Assignment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            className="sm:max-w-[425px]"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>
                Assign Scout to{" "}
                {selectedCell &&
                  `Q-${
                    selectedCell.matchNumber
                  } - ${selectedCell.role.toUpperCase()}`}
              </DialogTitle>
            </DialogHeader>
            <Command className="rounded-lg border">
              <CommandInput placeholder="Search scouts..." />
              <CommandList>
                <CommandEmpty>No scout found.</CommandEmpty>
                <CommandGroup heading="Available Scouts">
                  {availableScouts.map((profile) => {
                    const initials = (profile.name || "U")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);
                    return (
                      <CommandItem
                        key={profile.id}
                        onSelect={() => handleAssignScout(profile)}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/20 text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {profile.name || "Unknown"}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
