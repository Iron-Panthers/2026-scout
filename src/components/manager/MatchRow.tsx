import { memo } from "react";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X, Check } from "lucide-react";
import type { Role, MatchAssignment, Profile } from "@/types";

const getRoleCellColor = (role: Role) => {
  if (role.startsWith("red") || role === "qualRed") {
    return "bg-red-900/10 border-r border-red-900/30";
  }
  return "bg-blue-900/10 border-r border-blue-900/30";
};

interface MatchRowProps {
  match: MatchAssignment;
  roles: Role[];
  onOpenDialog: (matchNumber: number, role: Role, slot?: 1 | 2) => void;
  onClearAssignment: (matchNumber: number, role: Role, slot?: 1 | 2) => void;
  completedSubmissions: Set<string>; // Set of "matchId:role:scouterId" — per-scouter, not per-role
  actualScouters: Map<string, string>; // Map of "matchId:role" -> scouter_id
  availableScouts: Profile[]; // All profiles to look up names
  cosmeticsMap?: Record<string, Record<string, string>>; // userId -> equipped cosmetics
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
    actualScouters,
    availableScouts,
    cosmeticsMap = {},
    isSelected = false,
    onToggleSelect,
  }: MatchRowProps) => {
    return (
      <TableRow>
        <TableCell className="border-r border-border">
          <div className="flex items-center justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect?.(match.matchId || "")}
              disabled={!match.matchId}
            />
          </div>
        </TableCell>
        <TableCell
          className={`font-mono font-semibold border-r border-border ${onToggleSelect && match.matchId ? "cursor-pointer select-none hover:bg-accent/50" : ""}`}
          onClick={() => onToggleSelect?.(match.matchId || "")}
        >
          Q-{match.matchNumber}
        </TableCell>
        {roles.map((role) => {
          const assignment1 = match.assignments[role];
          const assignment2 = match.assignments2?.[role];

          // Each slot's checkmark reflects only that specific scouter's own
          // submission, so one scout completing their part doesn't also mark
          // the other (primary vs. co-scout) as done.
          const isCompleted1 = !!(
            match.matchId && assignment1 &&
            completedSubmissions.has(`${match.matchId}:${role}:${assignment1.id}`)
          );
          const isCompleted2 = !!(
            match.matchId && assignment2 &&
            completedSubmissions.has(`${match.matchId}:${role}:${assignment2.id}`)
          );

          // Get actual scouter if submission exists
          const actualScouterId = match.matchId
            ? actualScouters.get(`${match.matchId}:${role}`)
            : null;
          const actualScouter = actualScouterId
            ? availableScouts.find((s) => s.id === actualScouterId)
            : null;

          // Green once every scouter assigned to this role has submitted,
          // yellow if only some of them have (e.g. the primary but not the
          // co-scout yet), and the normal alliance color if none have.
          const assignedCount = (assignment1 ? 1 : 0) + (assignment2 ? 1 : 0);
          const completedCount = (isCompleted1 ? 1 : 0) + (isCompleted2 ? 1 : 0);
          const cellColorClass =
            assignedCount > 0 && completedCount === assignedCount
              ? "bg-green-900/30"
              : completedCount > 0
              ? "bg-yellow-900/30"
              : getRoleCellColor(role);

          const renderSlot = (slot: 1 | 2) => {
            const assignment = slot === 2 ? assignment2 : assignment1;
            const isCompleted = slot === 2 ? isCompleted2 : isCompleted1;
            const isDifferentScouter =
              slot === 1 && actualScouter && assignment && actualScouter.id !== assignment.id;

            return assignment ? (
              <div className="relative group flex-1 min-w-0">
                <button
                  onClick={() => onOpenDialog(match.matchNumber, role, slot)}
                  className="flex flex-col items-center gap-0.5 md:gap-1 hover:bg-accent/50 rounded-md p-1 md:p-1.5 transition-colors w-full"
                >
                  <CosmeticAvatar
                    avatarUrl={assignment.avatar}
                    initials={assignment.initials}
                    equippedCosmetics={cosmeticsMap[assignment.id] ?? {}}
                    size="sm"
                    className="h-7 w-7 md:h-9 md:w-9"
                  />
                  <span className="text-[9px] leading-tight md:text-[11px] font-medium text-center truncate w-full">
                    {assignment.name}
                  </span>
                  {isCompleted && !isDifferentScouter && (
                    <Check className="h-3 w-3 text-green-400" />
                  )}
                  {isDifferentScouter && actualScouter && (
                    <span className="text-[9px] text-orange-400 font-semibold">
                      ✓ by {actualScouter.name?.split(' ')[0] || 'Other'}
                    </span>
                  )}
                  {!assignment.registered && (
                    <span className="text-[9px] text-gray-400 font-semibold">
                      Not registered for Event
                    </span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearAssignment(match.matchNumber, role, slot);
                  }}
                  className="absolute top-0 right-0 h-5 w-5 rounded-full bg-destructive/90 hover:bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title="Clear assignment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center min-w-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenDialog(match.matchNumber, role, slot)}
                  className="h-7 w-7 md:h-9 md:w-9"
                  title={slot === 2 ? "Assign co-scout" : "Assign scout"}
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            );
          };

          return (
            <TableCell key={role} className={`p-1.5 md:p-2 ${cellColorClass}`}>
              <div className="flex items-start gap-0.5">
                {renderSlot(1)}
                {renderSlot(2)}
              </div>
            </TableCell>
          );
        })}
      </TableRow>
    );
  }
);

MatchRow.displayName = "MatchRow";
