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
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAllProfiles, getMatchesWithProfiles } from "@/lib/matches";
import { updateMatchAssignment } from "@/lib/matches";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import type { Profile, Role, MatchAssignment, SelectedCell } from "@/types";

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
        const { matches: dbMatches, profiles } = await getMatchesWithProfiles();
        setAvailableScouts(Array.from(profiles.values()));

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
              Showing {startIndex + 1}-{Math.min(endIndex, matches.length)} of{" "}
              {matches.length} matches
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
