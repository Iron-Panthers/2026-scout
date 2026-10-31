import { useState } from "react";
import { ListOrdered, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PicklistCardContent } from "@/components/strategy/PicklistCardContent";
import type { TBATeamSimple } from "@/lib/blueAlliance";

function TeamList({ teams, showRank }: { teams: TBATeamSimple[]; showRank: boolean }) {
  return (
    <div className="space-y-1.5">
      {teams.map((team, index) => (
        <Card key={team.team_number} className="gap-0 py-0">
          <PicklistCardContent team={team} showRank={showRank} index={index} />
        </Card>
      ))}
    </div>
  );
}

/**
 * On the live picklist: a tab on the left edge that slides out the viewer's own picklist,
 * one column wide, to scroll through next to the live list. It can't be sorted here.
 */
export function MyPicklistTab({ picked, doNotPick }: { picked: TBATeamSimple[]; doNotPick: TBATeamSimple[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed left-0 top-1/2 z-40 -translate-y-1/2 cursor-pointer rounded-r-md border border-l-0 bg-card px-1.5 py-3 shadow-md transition-colors hover:bg-accent"
          aria-label="Show my picklist"
        >
          {/* Reads bottom to top, down the edge of the screen */}
          <span className="flex rotate-180 items-center gap-1.5 text-xs font-semibold [writing-mode:vertical-rl]">
            <ListOrdered className="h-3.5 w-3.5 rotate-90" />
            My Picklist
          </span>
        </button>
      )}

      <aside
        inert={!open}
        aria-label="My picklist"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r bg-background shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">My Picklist</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Hide my picklist" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          {picked.length === 0 && doNotPick.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              You haven't sorted any teams yet. Sort them on the Picklist page.
            </p>
          ) : (
            <>
              <TeamList teams={picked} showRank />
              {doNotPick.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Do Not Pick</p>
                  <TeamList teams={doNotPick} showRank={false} />
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
