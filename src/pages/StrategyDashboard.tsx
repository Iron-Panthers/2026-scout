import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListOrdered, ArrowUpDown, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getEvents } from "@/lib/matches";
import { getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import { getEventEpaMap } from "@/lib/statbotics";
import { getEventScoutingAverages } from "@/lib/scoutingSchema";
import { getPicklist, upsertPicklist } from "@/lib/picklists";
import UserProfileMenu from "@/components/UserProfileMenu";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamInfoDialog } from "@/components/TeamInfoDialog";
import type { Event } from "@/types";

type PicklistColumnKey = "bank" | "picklist" | "doNotPick";

function PicklistCardContent({
  team,
  showRank,
  index,
}: {
  team: TBATeamSimple;
  showRank?: boolean;
  index?: number;
}) {
  return (
    <CardContent className="flex items-center gap-2.5 px-3 py-2">
      {showRank && (
        <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
          {(index ?? 0) + 1}
        </span>
      )}
      <TeamLogo
        teamNumber={team.team_number}
        className="h-11 w-11 shrink-0 rounded-md border bg-muted object-contain"
      />
      <div className="flex min-w-0 flex-col justify-center">
        <p className="font-mono text-sm font-bold">{team.team_number}</p>
        <p className="truncate text-xs text-muted-foreground">
          {team.nickname || "Unknown team"}
        </p>
      </div>
    </CardContent>
  );
}

interface SortablePicklistCardProps {
  team: TBATeamSimple;
  column: PicklistColumnKey;
  index: number;
  showRank: boolean;
  onCardClick: (team: TBATeamSimple) => void;
  /** Screen position (viewport coords) this card was dropped at, if it just
   * landed in this column from a different one — used to animate it flying
   * from the drop point to its sorted resting position. */
  flyFrom?: { top: number; left: number } | null;
  onFlyDone?: () => void;
}

// A single draggable/sortable team card. Works with mouse, touch, and pen
// input uniformly via dnd-kit's pointer sensors (native HTML5 drag-and-drop
// doesn't fire on touch devices at all).
function SortablePicklistCard({
  team,
  column,
  index,
  showRank,
  onCardClick,
  flyFrom,
  onFlyDone,
}: SortablePicklistCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team.team_number,
    data: { column },
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // When this card just moved into a new column (a sorted position dnd-kit
  // has no prior rect for), fly it in from where it was dropped instead of
  // letting it pop straight into place. Driven via the Web Animations API
  // (rather than a two-step style write) since that's a single atomic call
  // the browser is guaranteed to animate — writing an inline "from" transform
  // and then a "to" transform across two renders is prone to both landing in
  // the same paint with no visible transition in between.
  useLayoutEffect(() => {
    if (!flyFrom || !nodeRef.current) return;
    const el = nodeRef.current;
    const toRect = el.getBoundingClientRect();
    const dx = flyFrom.left - toRect.left;
    const dy = flyFrom.top - toRect.top;

    const animation = el.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
      { duration: 250, easing: "ease", fill: "both" }
    );
    animation.finished
      .then(() => {
        animation.cancel();
        onFlyDone?.();
      })
      .catch(() => {});
    return () => animation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyFrom]);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        nodeRef.current = node;
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <Card
        onClick={() => onCardClick(team)}
        className={`cursor-grab gap-0 py-0 transition-opacity hover:bg-accent/50 active:cursor-grabbing ${
          isDragging ? "opacity-50" : ""
        }`}
      >
        <PicklistCardContent team={team} showRank={showRank} index={index} />
      </Card>
    </div>
  );
}

interface PicklistColumnProps {
  columnKey: PicklistColumnKey;
  title: string;
  headerAction?: React.ReactNode;
  teams: TBATeamSimple[];
  emptyMessage: string;
  showRank: boolean;
  onCardClick: (team: TBATeamSimple) => void;
  flyingTeam?: { teamNumber: number; rect: { top: number; left: number } } | null;
  onFlyDone?: () => void;
}

function PicklistColumn({
  columnKey,
  title,
  headerAction,
  teams,
  emptyMessage,
  showRank,
  onCardClick,
  flyingTeam,
  onFlyDone,
}: PicklistColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <div>
      <div className="mb-1.5 flex h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        {headerAction}
      </div>
      <div
        ref={setNodeRef}
        className="flex min-h-32 flex-col gap-2 rounded-lg border border-dashed p-1.5"
      >
        {teams.length === 0 && (
          <p className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        <SortableContext
          items={teams.map((t) => t.team_number)}
          strategy={verticalListSortingStrategy}
        >
          {teams.map((team, index) => (
            <SortablePicklistCard
              key={team.team_number}
              team={team}
              column={columnKey}
              index={index}
              showRank={showRank}
              onCardClick={onCardClick}
              flyFrom={flyingTeam?.teamNumber === team.team_number ? flyingTeam.rect : null}
              onFlyDone={flyingTeam?.teamNumber === team.team_number ? onFlyDone : undefined}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function StrategyDashboard() {
  const { user, profile, getAvatarUrl } = useAuth();
  const [strategyPage, setStrategyPage] = useState<"picklist" | "event">("picklist");
  const [pickedTeams, setPickedTeams] = useState<TBATeamSimple[]>([]);
  const [doNotPickTeams, setDoNotPickTeams] = useState<TBATeamSimple[]>([]);
  const [bankTeams, setBankTeams] = useState<TBATeamSimple[]>([]);
  const [bankSortMode, setBankSortMode] = useState<"number" | "epa" | "scouting">("number");
  const [teamEpaMap, setTeamEpaMap] = useState<Map<number, number>>(new Map());
  const [epaLoading, setEpaLoading] = useState(false);
  const [epaLoadedEventId, setEpaLoadedEventId] = useState<string | null>(null);
  const [teamScoutingAvgMap, setTeamScoutingAvgMap] = useState<Map<number, number>>(new Map());
  const [scoutingAvgLoading, setScoutingAvgLoading] = useState(false);
  const [scoutingAvgLoadedEventId, setScoutingAvgLoadedEventId] = useState<string | null>(null);
  const [picklistLoading, setPicklistLoading] = useState(false);
  const [activeDragTeamNumber, setActiveDragTeamNumber] = useState<number | null>(null);
  const [flyingTeam, setFlyingTeam] = useState<{
    teamNumber: number;
    rect: { top: number; left: number };
  } | null>(null);
  const [picklistEvents, setPicklistEvents] = useState<Event[]>([]);
  const [selectedPicklistEventId, setSelectedPicklistEventId] = useState("");
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
  const [teamInfoTeam, setTeamInfoTeam] = useState<TBATeamSimple | null>(null);
  const [mobilePicklistTab, setMobilePicklistTab] = useState<"picklist" | "doNotPick">(
    "picklist"
  );

  const userName =
    profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Scout";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = getAvatarUrl();

  useEffect(() => {
    getEvents().then((events) => {
      setPicklistEvents(events);
      const initialEvent = events.find((event) => event.is_active) ?? events[0];
      if (initialEvent) setSelectedPicklistEventId(initialEvent.id);
    });
  }, []);

  useEffect(() => {
    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event?.event_code) {
      setBankTeams([]);
      setPickedTeams([]);
      setDoNotPickTeams([]);
      return;
    }

    const loadPicklist = async () => {
      setPicklistLoading(true);
      const teams = await getEventTeams(event.event_code!);
      const roster = teams.sort((a, b) => a.team_number - b.team_number);

      const saved = user?.id ? await getPicklist(user.id, event.id) : null;

      if (saved) {
        const rosterByNumber = new Map(roster.map((t) => [t.team_number, t]));
        const picked = saved.picked_team_numbers
          .map((n) => rosterByNumber.get(n))
          .filter((t): t is TBATeamSimple => t != null);
        const doNotPick = saved.do_not_pick_team_numbers
          .map((n) => rosterByNumber.get(n))
          .filter((t): t is TBATeamSimple => t != null);
        const used = new Set([...saved.picked_team_numbers, ...saved.do_not_pick_team_numbers]);
        setPickedTeams(picked);
        setDoNotPickTeams(doNotPick);
        setBankTeams(roster.filter((t) => !used.has(t.team_number)));
      } else {
        setBankTeams(roster);
        setPickedTeams([]);
        setDoNotPickTeams([]);
      }
      setPicklistLoading(false);
    };
    loadPicklist();

    // EPA/scouting-average data is event-specific; drop the old event's
    // data so we don't sort by the wrong event's numbers while the new
    // one (re)loads.
    setTeamEpaMap(new Map());
    setEpaLoadedEventId(null);
    setTeamScoutingAvgMap(new Map());
    setScoutingAvgLoadedEventId(null);
  }, [picklistEvents, selectedPicklistEventId, user?.id]);

  // Lazily fetch Statbotics EPA ratings the first time "Sort by EPA" is used
  // for this event.
  useEffect(() => {
    if (bankSortMode !== "epa") return;
    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event?.event_code || epaLoadedEventId === selectedPicklistEventId) return;

    let mounted = true;
    setEpaLoading(true);
    getEventEpaMap(event.event_code).then((map) => {
      if (!mounted) return;
      setTeamEpaMap(map);
      setEpaLoadedEventId(selectedPicklistEventId);
      setEpaLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [bankSortMode, picklistEvents, selectedPicklistEventId, epaLoadedEventId]);

  // Lazily fetch scouted averages the first time "Sort by Scouting Averages"
  // is used for this event.
  useEffect(() => {
    if (bankSortMode !== "scouting") return;
    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event || scoutingAvgLoadedEventId === selectedPicklistEventId) return;

    let mounted = true;
    setScoutingAvgLoading(true);
    getEventScoutingAverages(event.id).then((map) => {
      if (!mounted) return;
      setTeamScoutingAvgMap(map);
      setScoutingAvgLoadedEventId(selectedPicklistEventId);
      setScoutingAvgLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [bankSortMode, picklistEvents, selectedPicklistEventId, scoutingAvgLoadedEventId]);

  const sortedBankTeams = useMemo(() => {
    const sortByMap = (map: Map<number, number>) =>
      [...bankTeams].sort((a, b) => {
        const aVal = map.get(a.team_number);
        const bVal = map.get(b.team_number);
        if (aVal == null && bVal == null) return a.team_number - b.team_number;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        return bVal - aVal;
      });

    if (bankSortMode === "epa" && teamEpaMap.size > 0) return sortByMap(teamEpaMap);
    if (bankSortMode === "scouting" && teamScoutingAvgMap.size > 0) {
      return sortByMap(teamScoutingAvgMap);
    }
    return [...bankTeams].sort((a, b) => a.team_number - b.team_number);
  }, [bankTeams, bankSortMode, teamEpaMap, teamScoutingAvgMap]);

  // Every team at the event belongs to exactly one of these three lists
  // (picked/do-not-pick from the saved picklist, everything else in the
  // bank), so combining them gives the full roster without a second fetch.
  const allEventTeams = useMemo(
    () =>
      [...pickedTeams, ...doNotPickTeams, ...bankTeams].sort(
        (a, b) => a.team_number - b.team_number
      ),
    [pickedTeams, doNotPickTeams, bankTeams]
  );

  // dnd-kit sensors: PointerSensor covers mouse/pen, TouchSensor covers touch.
  // Both need a small activation threshold so a plain tap/click (to open the
  // team info dialog) or a scroll gesture isn't mistaken for a drag.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const findColumnOfTeam = (teamNumber: number): PicklistColumnKey | null => {
    if (pickedTeams.some((t) => t.team_number === teamNumber)) return "picklist";
    if (doNotPickTeams.some((t) => t.team_number === teamNumber)) return "doNotPick";
    if (bankTeams.some((t) => t.team_number === teamNumber)) return "bank";
    return null;
  };

  const activeDragTeam =
    activeDragTeamNumber != null
      ? pickedTeams.find((t) => t.team_number === activeDragTeamNumber) ??
        doNotPickTeams.find((t) => t.team_number === activeDragTeamNumber) ??
        bankTeams.find((t) => t.team_number === activeDragTeamNumber) ??
        null
      : null;

  const handleDndDragStart = (event: DragStartEvent) => {
    setActiveDragTeamNumber(Number(event.active.id));
  };

  const handleDndDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragTeamNumber(null);
    if (!over) return;

    const activeTeamNumber = Number(active.id);
    const sourceColumn = findColumnOfTeam(activeTeamNumber);
    if (!sourceColumn) return;

    const overId = over.id;
    const overIsColumn = overId === "bank" || overId === "picklist" || overId === "doNotPick";
    const overColumn: PicklistColumnKey = overIsColumn
      ? (overId as PicklistColumnKey)
      : ((over.data.current?.column as PicklistColumnKey | undefined) ?? sourceColumn);

    const arraysByColumn: Record<PicklistColumnKey, TBATeamSimple[]> = {
      bank: bankTeams,
      picklist: pickedTeams,
      doNotPick: doNotPickTeams,
    };

    let nextBank = arraysByColumn.bank;
    let nextPicked = arraysByColumn.picklist;
    let nextDoNotPick = arraysByColumn.doNotPick;
    const commit = (column: PicklistColumnKey, arr: TBATeamSimple[]) => {
      if (column === "bank") nextBank = arr;
      else if (column === "picklist") nextPicked = arr;
      else nextDoNotPick = arr;
    };

    if (sourceColumn === overColumn) {
      // The bank has no meaningful manual order (always re-sorted for
      // display), and dropping on the column's own empty space is a no-op.
      if (sourceColumn === "bank" || overIsColumn) return;
      const arr = arraysByColumn[sourceColumn];
      const fromIndex = arr.findIndex((t) => t.team_number === activeTeamNumber);
      const toIndex = arr.findIndex((t) => t.team_number === Number(overId));
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      commit(sourceColumn, arrayMove(arr, fromIndex, toIndex));
    } else {
      const sourceArr = [...arraysByColumn[sourceColumn]];
      const fromIndex = sourceArr.findIndex((t) => t.team_number === activeTeamNumber);
      if (fromIndex < 0) return;
      const [movedTeam] = sourceArr.splice(fromIndex, 1);

      const targetArr = [...arraysByColumn[overColumn]];
      const overIndex = overIsColumn
        ? targetArr.length
        : targetArr.findIndex((t) => t.team_number === Number(overId));
      targetArr.splice(overIndex >= 0 ? overIndex : targetArr.length, 0, movedTeam);

      commit(sourceColumn, sourceArr);
      commit(overColumn, targetArr);

      // The destination column (especially "bank", which is always re-sorted
      // for display) may place this card far from where it was dropped, with
      // no prior rect for dnd-kit's own sortable animation to interpolate
      // from. Fly it in manually from the drop point instead of letting it
      // just appear — using our own transform animation (not DragOverlay's
      // built-in drop animation) so nothing forces the page to scroll to it.
      const dropRect = active.rect.current.translated ?? active.rect.current.initial;
      if (dropRect) {
        setFlyingTeam({ teamNumber: activeTeamNumber, rect: dropRect });
      }
    }

    setBankTeams(nextBank);
    setPickedTeams(nextPicked);
    setDoNotPickTeams(nextDoNotPick);

    if (user?.id && selectedPicklistEventId) {
      upsertPicklist(
        user.id,
        selectedPicklistEventId,
        nextPicked.map((t) => t.team_number),
        nextDoNotPick.map((t) => t.team_number)
      );
    }
  };

  const selectedPicklistEvent = picklistEvents.find(
    (event) => event.id === selectedPicklistEventId
  );

  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto p-6 max-w-7xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <ListOrdered className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">
                {strategyPage === "picklist" ? "Picklist" : "Event"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {strategyPage === "picklist"
                  ? "Sort teams however you want! This list is only visible for you."
                  : "All teams competing at the selected event."}
              </p>
            </div>
          </div>
          <UserProfileMenu userName={userName} userInitials={userInitials} avatarUrl={avatarUrl} />
        </div>

        <section>
          <div className="mb-4 flex justify-end">
            <Select value={selectedPicklistEventId} onValueChange={setSelectedPicklistEventId}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Picklist event">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {picklistEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {strategyPage === "picklist" ? (
            <>
              <div className="mb-4 flex items-center gap-1 rounded-lg border p-1 sm:hidden">
                <Button
                  size="sm"
                  variant={mobilePicklistTab === "picklist" ? "default" : "ghost"}
                  className={
                    mobilePicklistTab === "picklist"
                      ? "flex-1 text-xs font-semibold shadow-sm"
                      : "flex-1 text-xs text-muted-foreground hover:text-foreground"
                  }
                  onClick={() => setMobilePicklistTab("picklist")}
                >
                  Your Picklist
                </Button>
                <Button
                  size="sm"
                  variant={mobilePicklistTab === "doNotPick" ? "default" : "ghost"}
                  className={
                    mobilePicklistTab === "doNotPick"
                      ? "flex-1 text-xs font-semibold shadow-sm"
                      : "flex-1 text-xs text-muted-foreground hover:text-foreground"
                  }
                  onClick={() => setMobilePicklistTab("doNotPick")}
                >
                  Do Not Pick
                </Button>
              </div>
              {picklistLoading ? (
                <p className="text-muted-foreground">Loading event teams...</p>
              ) : pickedTeams.length === 0 && bankTeams.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No teams found for the active event.</p>
                </Card>
              ) : (
                <DndContext
                  sensors={dndSensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDndDragStart}
                  onDragEnd={handleDndDragEnd}
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
                    <div className={mobilePicklistTab === "doNotPick" ? "hidden sm:block" : ""}>
                      <PicklistColumn
                        columnKey="picklist"
                        title="Your Picklist"
                        teams={pickedTeams}
                        emptyMessage="Picklist goes here I think"
                        showRank
                        onCardClick={(team) => {
                          setTeamInfoTeam(team);
                          setTeamInfoOpen(true);
                        }}
                        flyingTeam={flyingTeam}
                        onFlyDone={() => setFlyingTeam(null)}
                      />
                    </div>

                    <div className={mobilePicklistTab === "picklist" ? "hidden sm:block" : ""}>
                      <PicklistColumn
                        columnKey="doNotPick"
                        title="Do Not Pick"
                        teams={doNotPickTeams}
                        emptyMessage="Skibidi"
                        showRank
                        onCardClick={(team) => {
                          setTeamInfoTeam(team);
                          setTeamInfoOpen(true);
                        }}
                        flyingTeam={flyingTeam}
                        onFlyDone={() => setFlyingTeam(null)}
                      />
                    </div>

                    <PicklistColumn
                      columnKey="bank"
                      title="Available Teams"
                      headerAction={
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[10px] font-semibold uppercase text-muted-foreground"
                            >
                              {epaLoading || scoutingAvgLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3" />
                              )}
                              Sort
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuRadioGroup
                              value={bankSortMode}
                              onValueChange={(value) =>
                                setBankSortMode(value as "number" | "epa" | "scouting")
                              }
                            >
                              <DropdownMenuRadioItem value="number">
                                Team Number
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="epa">
                                EPA (Statbotics)
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="scouting">
                                Scouting Averages
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      }
                      teams={sortedBankTeams}
                      emptyMessage="All teams have been picked."
                      showRank={false}
                      onCardClick={(team) => {
                        setTeamInfoTeam(team);
                        setTeamInfoOpen(true);
                      }}
                      flyingTeam={flyingTeam}
                      onFlyDone={() => setFlyingTeam(null)}
                    />
                  </div>

                  <DragOverlay dropAnimation={null}>
                    {activeDragTeam ? (
                      <Card className="cursor-grabbing gap-0 py-0 shadow-lg">
                        <PicklistCardContent team={activeDragTeam} />
                      </Card>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </>
          ) : picklistLoading ? (
            <p className="text-muted-foreground">Loading event teams...</p>
          ) : allEventTeams.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No teams found for the selected event.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {allEventTeams.map((team) => (
                <Card
                  key={team.team_number}
                  onClick={() => {
                    setTeamInfoTeam(team);
                    setTeamInfoOpen(true);
                  }}
                  className="cursor-pointer gap-0 py-0 hover:bg-accent/50"
                >
                  <PicklistCardContent team={team} />
                </Card>
              ))}
            </div>
          )}

          <TeamInfoDialog
            open={teamInfoOpen}
            onOpenChange={setTeamInfoOpen}
            teamNumber={teamInfoTeam?.team_number ?? null}
            nickname={teamInfoTeam?.nickname}
            eventId={selectedPicklistEvent?.id}
            eventCode={selectedPicklistEvent?.event_code}
            userId={user?.id}
          />
        </section>

        <nav className="fixed inset-x-4 bottom-4 z-30 mx-auto mt-8 flex max-w-xl items-center justify-center gap-1 rounded-xl border-2 border-border bg-card p-1 shadow-xl backdrop-blur">
          <Button
            size="sm"
            variant={strategyPage === "picklist" ? "default" : "ghost"}
            className={
              strategyPage === "picklist"
                ? "flex-1 min-w-0 px-1.5 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm"
                : "flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            }
            onClick={() => setStrategyPage("picklist")}
          >
            Picklist
          </Button>
          <Button
            size="sm"
            variant={strategyPage === "event" ? "default" : "ghost"}
            className={
              strategyPage === "event"
                ? "flex-1 min-w-0 px-1.5 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm"
                : "flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            }
            onClick={() => setStrategyPage("event")}
          >
            Event
          </Button>
        </nav>
      </main>
    </div>
  );
}
