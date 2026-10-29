import { CardContent } from "@/components/ui/card";
import { TeamLogo } from "@/components/TeamLogo";
import type { TBATeamSimple } from "@/lib/blueAlliance";
import { cn } from "@/lib/utils";

/** The inside of a picklist team card: rank, logo, number and nickname. */
export function PicklistCardContent({
  team,
  showRank,
  index,
  rankLabel,
  detail,
  below,
  className,
}: {
  team: TBATeamSimple;
  showRank?: boolean;
  index?: number;
  /** Shown in place of the position number (e.g. a tied team's shared place). */
  rankLabel?: string;
  /** A small line on the right of the card. */
  detail?: React.ReactNode;
  /** Shown under the nickname (e.g. the live picklist host's tag). */
  below?: React.ReactNode;
  className?: string;
}) {
  return (
    <CardContent className={cn("flex items-center gap-2.5 px-3 py-2", className)}>
      {showRank && (
        <span className="min-w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
          {rankLabel ?? (index ?? 0) + 1}
        </span>
      )}
      <TeamLogo
        teamNumber={team.team_number}
        className="h-11 w-11 shrink-0 rounded-md border bg-muted object-contain"
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="font-mono text-sm font-bold">{team.team_number}</p>
        <p className="truncate text-xs text-muted-foreground">
          {team.nickname || "Unknown team"}
        </p>
        {below && <div className="mt-0.5 flex min-w-0">{below}</div>}
      </div>
      {detail}
    </CardContent>
  );
}
