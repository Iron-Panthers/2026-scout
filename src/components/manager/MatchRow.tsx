import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
import type { Role, MatchAssignment } from "@/types";

const getRoleCellColor = (role: Role) => {
  if (role.startsWith("red") || role === "qualRed") {
    return "bg-red-900/10 border-r border-red-900/30";
  }
  return "bg-blue-900/10 border-r border-blue-900/30";
};

interface MatchRowProps {
  match: MatchAssignment;
  roles: Role[];
  onOpenDialog: (matchNumber: number, role: Role) => void;
  onClearAssignment: (matchNumber: number, role: Role) => void;
  completedSubmissions: Set<string>;
  isSelected?: boolean;
  onToggleSelect?: (matchId: string) => void;
}

export const MatchRow = memo(
  ({
    match,
    roles,
    onOpenDialog,
    onClearAssignment,
    completedSubmissions,
    isSelected = false,
    onToggleSelect,
  }: MatchRowProps) => {
    return (
      <TableRow>
        <TableCell className="border-r border-border">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.(match.matchId || "")}
            disabled={!match.matchId}
          />
        </TableCell>
        <TableCell className="font-mono font-semibold border-r border-border">
          Q-{match.matchNumber}
        </TableCell>
        {roles.map((role) => {
          const assignment = match.assignments[role];
          const isCompleted =
            match.matchId &&
            completedSubmissions.has(`${match.matchId}:${role}`);
          const cellColorClass = isCompleted
            ? "bg-green-900/30"
            : getRoleCellColor(role);
          return (
            <TableCell key={role} className={`p-1.5 md:p-2 ${cellColorClass}`}>
              {assignment ? (
                <div className="relative group">
                  <button
                    onClick={() => onOpenDialog(match.matchNumber, role)}
                    className="flex flex-col items-center gap-0.5 md:gap-1 hover:bg-accent/50 rounded-md p-1.5 md:p-2 transition-colors w-full"
                  >
                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={assignment.avatar} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {assignment.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] leading-tight md:text-xs font-medium text-center">
                      {assignment.name}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearAssignment(match.matchNumber, role);
                    }}
                    className="absolute top-0 right-0 h-5 w-5 rounded-full bg-destructive/90 hover:bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title="Clear assignment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenDialog(match.matchNumber, role)}
                    className="h-8 w-8 md:h-10 md:w-10"
                  >
                    <Plus className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
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
