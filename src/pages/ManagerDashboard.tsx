import { useState } from "react";
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
import { Plus } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import type { Scout, Role, MatchAssignment, SelectedCell } from "@/types";

// Mock data for available scouts
const availableScouts: Scout[] = [
  { id: 1, name: "Alex Chen", initials: "AC", avatar: "" },
  { id: 2, name: "Jordan Smith", initials: "JS", avatar: "" },
  { id: 3, name: "Taylor Johnson", initials: "TJ", avatar: "" },
  { id: 4, name: "Morgan Davis", initials: "MD", avatar: "" },
  { id: 5, name: "Casey Wilson", initials: "CW", avatar: "" },
  { id: 6, name: "Riley Brown", initials: "RB", avatar: "" },
  { id: 7, name: "Jamie Garcia", initials: "JG", avatar: "" },
  { id: 8, name: "Quinn Martinez", initials: "QM", avatar: "" },
];

export default function ManagerDashboard() {
  const managerName = "Sarah Mitchell";
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

  // Generate 100 matches with empty assignments
  const [matches, setMatches] = useState<MatchAssignment[]>(
    Array.from({ length: 100 }, (_, i) => ({
      matchNumber: i + 1,
      assignments: {},
    }))
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const handleAssignScout = (scout: Scout) => {
    if (!selectedCell) return;

    setMatches((prevMatches) =>
      prevMatches.map((match) =>
        match.matchNumber === selectedCell.matchNumber
          ? {
              ...match,
              assignments: {
                ...match.assignments,
                [selectedCell.role]: scout,
              },
            }
          : match
      )
    );

    setDialogOpen(false);
    setSelectedCell(null);
  };

  const openAssignmentDialog = (matchNumber: number, role: Role) => {
    setSelectedCell({ matchNumber, role });
    setDialogOpen(true);
  };

  const getAssignment = (matchNumber: number, role: Role) => {
    const match = matches.find((m) => m.matchNumber === matchNumber);
    return match?.assignments[role];
  };

  const getRoleHeaderColor = (role: Role) => {
    if (role.startsWith("red") || role === "qualRed") {
      return "bg-red-900/30 text-red-400";
    }
    return "bg-blue-900/30 text-blue-400";
  };

  const getRoleCellColor = (role: Role) => {
    if (role.startsWith("red") || role === "qualRed") {
      return "bg-red-900/10 border-r border-red-900/30";
    }
    return "bg-blue-900/10 border-r border-blue-900/30";
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 max-w-[1600px]">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <DashboardHeader
            userName={managerName}
            subtitle="Manage scout assignments for the competition"
          />
          <UserProfileMenu
            userName={managerName}
            userInitials="SM"
            avatarUrl=""
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
                {matches.map((match) => (
                  <TableRow key={match.matchNumber}>
                    <TableCell className="font-mono font-semibold border-r border-border">
                      Q-{match.matchNumber}
                    </TableCell>
                    {roles.map((role) => {
                      const assignment = getAssignment(match.matchNumber, role);
                      return (
                        <TableCell
                          key={role}
                          className={`p-2 ${getRoleCellColor(role)}`}
                        >
                          {assignment ? (
                            <button
                              onClick={() =>
                                openAssignmentDialog(match.matchNumber, role)
                              }
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
                                onClick={() =>
                                  openAssignmentDialog(match.matchNumber, role)
                                }
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
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Assignment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
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
                  {availableScouts.map((scout) => (
                    <CommandItem
                      key={scout.id}
                      onSelect={() => handleAssignScout(scout)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={scout.avatar} />
                        <AvatarFallback className="text-xs bg-primary/20 text-primary">
                          {scout.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{scout.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
