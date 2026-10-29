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
  pointerWithin,
  type CollisionDetection,
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
import { Card } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListOrdered, ArrowUpDown, Loader2, RotateCcw, Radio, Info, Tag } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDevMode } from "@/contexts/DevModeContext";
import { getEvents } from "@/lib/matches";
import { getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import { getEventXpMap } from "@/lib/match13";
import { getEventScoutingAverages } from "@/lib/scoutingSchema";
import { getPicklist, upsertPicklist } from "@/lib/picklists";
import { unlockAchievement } from "@/lib/achievements";
import { useUrlState } from "@/hooks/useUrlState";
import {
  getDevEvent,
  getDevEvents,
  getDevPicklist,
  getDevTeams,
  isDevEventId,
  saveDevPicklist,
} from "@/lib/devMode";
import UserProfileMenu from "@/components/UserProfileMenu";
import { TeamInfoDialog } from "@/components/TeamInfoDialog";
import { ScoutingDataTable } from "@/components/strategy/ScoutingDataTable";
import { MatchDashboard } from "@/components/strategy/MatchDashboard";
import { TeamInfoPage } from "@/components/strategy/TeamInfoPage";
import { PicklistCardContent } from "@/components/strategy/PicklistCardContent";
import { LivePicklist, LivePicklistViewer } from "@/components/strategy/LivePicklist";
import { useLivePicklist } from "@/hooks/useLivePicklist";
import { endLivePicklist, entryTags, type LivePicklistTag } from "@/lib/livePicklists";
import { TeamTags } from "@/components/strategy/TeamTag";
import { LiveTeamNote } from "@/components/strategy/LiveTeamNote";
import { SCOUTING_DATA_TYPES, type ScoutingDataType } from "@/lib/strategyData";
import type { Event } from "@/types";

type PicklistColumnKey = "bank" | "picklist" | "doNotPick";

const picklistCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const pointer = args.pointerCoordinates;
  if (pointer) {
    const columnBelowLastCard = args.droppableContainers
      .filter((container) => container.id === "picklist" || container.id === "doNotPick")
      .map((column) => {
        const columnRect = args.droppableRects.get(column.id);
        const lastTeamCard = args.droppableContainers
          .filter((container) => container.data.current?.column === column.id)
          .map((container) => ({
            container,
            rect: args.droppableRects.get(container.id),
          }))
          .filter((entry) => entry.rect != null)
          .sort((a, b) => b.rect!.bottom - a.rect!.bottom)[0];

        return { columnRect, lastTeamCard };
      })
      .find(
        ({ columnRect, lastTeamCard }) =>
          columnRect != null &&
          lastTeamCard != null &&
          pointer.x >= columnRect.left &&
          pointer.x <= columnRect.right &&
          pointer.y > lastTeamCard.rect!.bottom
      );

    if (columnBelowLastCard?.lastTeamCard) {
      return closestCenter({
        ...args,
        droppableContainers: [columnBelowLastCard.lastTeamCard.container],
      });
    }

    // In the gap between two cards (or the padding above the first) the pointer
    // is inside a column but over no card, which the sortable list reads as "no
    // position" and snaps the cards back. That space belongs to the card below it.
    const isColumnId = (id: unknown) => id === "bank" || id === "picklist" || id === "doNotPick";
    if (pointerCollisions.length > 0 && pointerCollisions.every((collision) => isColumnId(collision.id))) {
      const cardBelowPointer = args.droppableContainers
        .filter((container) => pointerCollisions.some((collision) => collision.id === container.data.current?.column))
        .map((container) => ({ container, rect: args.droppableRects.get(container.id) }))
        .filter((entry) => entry.rect != null && entry.rect.top >= pointer.y)
        .sort((a, b) => a.rect!.top - b.rect!.top)[0]?.container;
      if (cardBelowPointer) {
        return closestCenter({ ...args, droppableContainers: [cardBelowPointer] });
      }
    }

    if (pointerCollisions.length > 0) return pointerCollisions;

    const sourceColumn = args.active.data.current?.column;
    if (sourceColumn === "picklist" || sourceColumn === "doNotPick") {
      const sourceColumnRect = args.droppableRects.get(sourceColumn);
      if (sourceColumnRect && pointer.y < sourceColumnRect.top) {
        const firstTeamCard = args.droppableContainers
          .filter((container) => container.data.current?.column === sourceColumn)
          .map((container) => ({
            container,
            rect: args.droppableRects.get(container.id),
          }))
          .filter((entry) => entry.rect != null)
          .sort((a, b) => a.rect!.top - b.rect!.top)[0]?.container;

        return closestCenter({
          ...args,
          droppableContainers: [firstTeamCard ?? args.droppableContainers.find(
            (container) => container.id === sourceColumn
          )!],
        });
      }
    }

    const columnBelowPointer = args.droppableContainers.find((container) => {
      if (container.id !== "bank" && container.id !== "picklist" && container.id !== "doNotPick") {
        return false;
      }
      const rect = args.droppableRects.get(container.id);
      return (
        rect != null &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y > rect.bottom
      );
    });
    if (columnBelowPointer) {
      const lastTeamCard = args.droppableContainers
        .filter((container) => container.data.current?.column === columnBelowPointer.id)
        .map((container) => ({
          container,
          rect: args.droppableRects.get(container.id),
        }))
        .filter((entry) => entry.rect != null)
        .sort((a, b) => b.rect!.bottom - a.rect!.bottom)[0]?.container;

      return closestCenter({
        ...args,
        droppableContainers: [lastTeamCard ?? columnBelowPointer],
      });
    }
  }

  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

interface SortablePicklistCardProps {
  team: TBATeamSimple;
  column: PicklistColumnKey;
  index: number;
  showRank: boolean;
  /** The live picklist host's tags on this team. */
  tags?: LivePicklistTag[];
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
  tags,
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
        <PicklistCardContent
          team={team}
          showRank={showRank}
          index={index}
          below={tags && <TeamTags tags={tags} dots />}
        />
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
  tags: Map<number, LivePicklistTag[]>;
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
  tags,
  onCardClick,
  flyingTeam,
  onFlyDone,
}: PicklistColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnKey });
  // Memoized: useDroppable re-renders this column whenever the drag target
  // changes, and a fresh ids array each time makes dnd-kit's useSortable think
  // the list changed, so it disables the transition on each card's first move
  // (the cards jump instead of sliding).
  const teamIds = useMemo(() => teams.map((t) => t.team_number), [teams]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
        {headerAction}
      </div>
      <div
        ref={setNodeRef}
        className="flex min-h-32 flex-1 flex-col gap-2 rounded-lg border border-dashed p-1.5"
      >
        {teams.length === 0 && (
          <p className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
        <SortableContext
          items={teamIds}
          strategy={verticalListSortingStrategy}
        >
          {teams.map((team, index) => (
            <SortablePicklistCard
              key={team.team_number}
              team={team}
              column={columnKey}
              index={index}
              showRank={showRank}
              tags={tags.get(team.team_number)}
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

type StrategyPage = "data" | "dashboard" | "teams" | "picklist" | "event";

const STRATEGY_PAGES: Record<StrategyPage, { label: string; title: string; description: string }> = {
  data: {
    label: "Data",
    title: "Data",
    description: "Every scouting submission for the selected event.",
  },
  dashboard: {
    label: "Dashboard",
    title: "Dashboard",
    description: "The six teams in a match, with their scouting data from the whole event.",
  },
  teams: {
    label: "Teams",
    title: "Team Info",
    description: "Pick a team to see everything scouted about it at this event.",
  },
  picklist: {
    label: "Picklist",
    title: "Picklist",
    description: "Sort teams however you want! This is your personal list and will be used in the live picklist.",
  },
  event: {
    label: "Event",
    title: "Event",
    description: "All teams competing at the selected event.",
  },
};
const STRATEGY_PAGE_IDS = Object.keys(STRATEGY_PAGES) as StrategyPage[];

export default function StrategyDashboard() {
  const { user, profile, getAvatarUrl } = useAuth();
  const { devMode } = useDevMode();
  // Opens on the match dashboard; the open page lives in the address (?page=...), so
  // reloading stays on it
  const [strategyPage, setStrategyPage] = useUrlState<StrategyPage>("page", "dashboard", STRATEGY_PAGE_IDS);
  // The live picklist opens over the Picklist page as ?live=1, so Back closes it.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const liveOpen = strategyPage === "picklist" && searchParams.get("live") === "1";
  const [scoutingDataType, setScoutingDataType] = useState<ScoutingDataType>("quantitative");
  // Where the Dashboard page puts its match toolbar, in place of the event dropdown.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
  // Whether the Dashboard page has a match open (the event dropdown hides then).
  const [matchOpen, setMatchOpen] = useState(false);
  // Per-event snapshot of the picklist columns, kept for the life of this
  // page. Switching events re-reads from here instead of the server when
  // we've already loaded (and possibly locally edited) that event this
  // session — a background save from a recent edit may not have landed yet,
  // so re-fetching on switch-back could show the stale pre-edit state.
  const picklistCacheRef = useRef<
    Record<string, { picked: TBATeamSimple[]; doNotPick: TBATeamSimple[]; bank: TBATeamSimple[] }>
  >({});
  // Chains picklist saves so they always land in the order they were
  // triggered — without this, two saves fired in quick succession (e.g.
  // rapid reordering) could resolve out of order and leave the DB reflecting
  // an earlier state than what's actually on screen.
  const pendingSaveRef = useRef<Promise<unknown>>(Promise.resolve());
  const [pickedTeams, setPickedTeams] = useState<TBATeamSimple[]>([]);
  const [doNotPickTeams, setDoNotPickTeams] = useState<TBATeamSimple[]>([]);
  const [bankTeams, setBankTeams] = useState<TBATeamSimple[]>([]);
  const [bankSortMode, setBankSortMode] = useState<"number" | "xp" | "scouting">("number");
  const [teamXpMap, setTeamXpMap] = useState<Map<number, number>>(new Map());
  const [xpLoading, setXpLoading] = useState(false);
  const [xpLoadedEventId, setXpLoadedEventId] = useState<string | null>(null);
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
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
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
    let mounted = true;
    const loadEvents = async () => {
      if (devMode && user?.id) {
        const events = getDevEvents(user.id);
        if (!mounted) return;
        setPicklistEvents(events);
        setSelectedPicklistEventId(getDevEvent(user.id).id);
        return;
      }

      const events = await getEvents();
      if (!mounted) return;
      setPicklistEvents(events);
      const initialEvent = events.find((event) => event.is_active) ?? events[0];
      if (initialEvent) setSelectedPicklistEventId(initialEvent.id);
    };
    void loadEvents();
    return () => {
      mounted = false;
    };
  }, [devMode, user?.id]);

  useEffect(() => {
    let mounted = true;
    if (devMode && (!user?.id || !isDevEventId(selectedPicklistEventId))) {
      setBankTeams([]);
      setPickedTeams([]);
      setDoNotPickTeams([]);
      setPicklistLoading(false);
      return;
    }

    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event?.event_code) {
      setBankTeams([]);
      setPickedTeams([]);
      setDoNotPickTeams([]);
      setPicklistLoading(false);
      return;
    }

    const cached = picklistCacheRef.current[event.id];
    if (cached) {
      setPickedTeams(cached.picked);
      setDoNotPickTeams(cached.doNotPick);
      setBankTeams(cached.bank);
      setPicklistLoading(false);
    } else {
      const loadPicklist = async () => {
        setPicklistLoading(true);
        const isSandboxEvent = devMode && !!user?.id && isDevEventId(event.id);
        const teams = isSandboxEvent
          ? getDevTeams(user!.id).map((team) => ({
              ...team,
              city: null,
              state_prov: null,
            }))
          : await getEventTeams(event.event_code!);
        if (!mounted) return;
        const roster = teams.sort((a, b) => a.team_number - b.team_number);

        const saved = user?.id
          ? isSandboxEvent
            ? getDevPicklist(user.id, event.id)
            : await getPicklist(user.id, event.id)
          : null;
        if (!mounted) return;

        let picked: TBATeamSimple[];
        let doNotPick: TBATeamSimple[];
        let bank: TBATeamSimple[];
        if (saved) {
          const rosterByNumber = new Map(roster.map((t) => [t.team_number, t]));
          picked = saved.picked_team_numbers
            .map((n) => rosterByNumber.get(n))
            .filter((t): t is TBATeamSimple => t != null);
          doNotPick = saved.do_not_pick_team_numbers
            .map((n) => rosterByNumber.get(n))
            .filter((t): t is TBATeamSimple => t != null);
          const used = new Set([...saved.picked_team_numbers, ...saved.do_not_pick_team_numbers]);
          bank = roster.filter((t) => !used.has(t.team_number));
        } else {
          bank = roster;
          picked = [];
          doNotPick = [];
        }

        picklistCacheRef.current[event.id] = { picked, doNotPick, bank };
        setPickedTeams(picked);
        setDoNotPickTeams(doNotPick);
        setBankTeams(bank);
        setPicklistLoading(false);
      };
      loadPicklist();
    }

    // xP/scouting-average data is event-specific; drop the old event's
    // data so we don't sort by the wrong event's numbers while the new
    // one (re)loads.
    setTeamXpMap(new Map());
    setXpLoadedEventId(null);
    setTeamScoutingAvgMap(new Map());
    setScoutingAvgLoadedEventId(null);
    return () => {
      mounted = false;
    };
  }, [picklistEvents, selectedPicklistEventId, user?.id, devMode]);

  // Lazily fetch match13 xP averages the first time "Sort by xP" is used
  // for this event.
  useEffect(() => {
    if (bankSortMode !== "xp") return;
    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event?.event_code || xpLoadedEventId === selectedPicklistEventId) return;
    if (devMode && isDevEventId(event.id)) {
      setTeamXpMap(new Map());
      setXpLoadedEventId(selectedPicklistEventId);
      setXpLoading(false);
      return;
    }

    let mounted = true;
    setXpLoading(true);
    getEventXpMap(event.event_code).then((map) => {
      if (!mounted) return;
      setTeamXpMap(map);
      setXpLoadedEventId(selectedPicklistEventId);
      setXpLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [bankSortMode, picklistEvents, selectedPicklistEventId, xpLoadedEventId, devMode]);

  // Lazily fetch scouted averages the first time "Sort by Scouting Averages"
  // is used for this event.
  useEffect(() => {
    if (bankSortMode !== "scouting") return;
    const event = picklistEvents.find((item) => item.id === selectedPicklistEventId);
    if (!event || scoutingAvgLoadedEventId === selectedPicklistEventId) return;
    if (devMode && isDevEventId(event.id)) {
      setTeamScoutingAvgMap(new Map());
      setScoutingAvgLoadedEventId(selectedPicklistEventId);
      setScoutingAvgLoading(false);
      return;
    }

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
  }, [bankSortMode, picklistEvents, selectedPicklistEventId, scoutingAvgLoadedEventId, devMode]);

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

    if (bankSortMode === "xp" && teamXpMap.size > 0) return sortByMap(teamXpMap);
    if (bankSortMode === "scouting" && teamScoutingAvgMap.size > 0) {
      return sortByMap(teamScoutingAvgMap);
    }
    return [...bankTeams].sort((a, b) => a.team_number - b.team_number);
  }, [bankTeams, bankSortMode, teamXpMap, teamScoutingAvgMap]);

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

  // Shows a new picklist state and saves it for the selected event.
  const applyPicklist = (
    nextPicked: TBATeamSimple[],
    nextDoNotPick: TBATeamSimple[],
    nextBank: TBATeamSimple[]
  ) => {
    setBankTeams(nextBank);
    setPickedTeams(nextPicked);
    setDoNotPickTeams(nextDoNotPick);

    // Strategist: a finished picklist, with every team at the event sorted out of the bank
    if (nextBank.length === 0 && nextPicked.length + nextDoNotPick.length > 0) {
      void unlockAchievement(user?.id, "picklist");
    }

    // Keep the session cache in sync so switching away to another event and
    // back re-reads this edit immediately, without waiting on (or racing) a
    // save that may still be in flight.
    if (selectedPicklistEventId) {
      picklistCacheRef.current[selectedPicklistEventId] = {
        picked: nextPicked,
        doNotPick: nextDoNotPick,
        bank: nextBank,
      };
    }

    if (user?.id && selectedPicklistEventId) {
      const eventId = selectedPicklistEventId;
      const pickedNumbers = nextPicked.map((t) => t.team_number);
      const doNotPickNumbers = nextDoNotPick.map((t) => t.team_number);
      if (devMode && isDevEventId(eventId)) {
        saveDevPicklist(user.id, eventId, pickedNumbers, doNotPickNumbers);
      } else {
        // Chain onto any still-pending save so writes always land in the
        // order they were triggered, even if an earlier request happens to
        // resolve slower than this one.
        pendingSaveRef.current = pendingSaveRef.current.then(() =>
          upsertPicklist(user.id, eventId, pickedNumbers, doNotPickNumbers)
        );
      }
    }
  };

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
      // display). Dropping a ranked team on its column background appends it.
      if (sourceColumn === "bank") return;
      const arr = arraysByColumn[sourceColumn];
      const fromIndex = arr.findIndex((t) => t.team_number === activeTeamNumber);
      if (overIsColumn) {
        if (fromIndex < 0 || fromIndex === arr.length - 1) return;
        commit(sourceColumn, arrayMove(arr, fromIndex, arr.length - 1));
      } else {
        const toIndex = arr.findIndex((t) => t.team_number === Number(overId));
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        commit(sourceColumn, arrayMove(arr, fromIndex, toIndex));
      }
    } else {
      const sourceArr = [...arraysByColumn[sourceColumn]];
      const fromIndex = sourceArr.findIndex((t) => t.team_number === activeTeamNumber);
      if (fromIndex < 0) return;
      const [movedTeam] = sourceArr.splice(fromIndex, 1);

      const targetArr = [...arraysByColumn[overColumn]];
      const overIndexRaw = overIsColumn
        ? targetArr.length
        : targetArr.findIndex((t) => t.team_number === Number(overId));
      let overIndex = overIndexRaw >= 0 ? overIndexRaw : targetArr.length;

      // Dropping on a card always inserted *before* it, so a team dragged
      // straight onto the last card in a column landed one spot short of
      // the bottom instead of at it. Compare the dragged card's vertical
      // center to the hovered card's to tell which half it was dropped on,
      // and insert after when it's the bottom half.
      if (!overIsColumn && overIndexRaw >= 0) {
        const overRect = over.rect;
        const activeRect = active.rect.current.translated ?? active.rect.current.initial;
        if (overRect && activeRect) {
          const overCenterY = overRect.top + overRect.height / 2;
          const activeCenterY = activeRect.top + activeRect.height / 2;
          if (activeCenterY > overCenterY) overIndex += 1;
        }
      }
      targetArr.splice(overIndex, 0, movedTeam);

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

    applyPicklist(nextPicked, nextDoNotPick, nextBank);
  };

  // Clears both the picklist and do-not-pick list, returning every team to
  // the bank.
  const handleResetPicklists = () => {
    applyPicklist([], [], allEventTeams);
    setResetDialogOpen(false);
  };

  const selectedPicklistEvent = picklistEvents.find(
    (event) => event.id === selectedPicklistEventId
  );
  const isPicklistHost = !!user?.id && selectedPicklistEvent?.picklist_host_id === user.id;
  // The host's shared live picklist (sandbox events have none: only the host's own screen).
  const livePicklist = useLivePicklist(
    selectedPicklistEventId && !(devMode && isDevEventId(selectedPicklistEventId)) ? selectedPicklistEventId : undefined
  );
  const picklistIsLive = !!livePicklist.row?.is_live;

  // Picklister: opening the live picklist, as its host or watching it run
  useEffect(() => {
    if (liveOpen && (isPicklistHost || picklistIsLive)) void unlockAchievement(user?.id, "live_picklist");
  }, [liveOpen, isPicklistHost, picklistIsLive, user?.id]);
  // Tags the host put on teams in the live picklist, shown on everyone's picklist cards
  // (kept after the live picklist ends).
  const liveTags = useMemo(
    () =>
      new Map(
        (livePicklist.row?.entries ?? [])
          .map((entry) => [entry.teamNumber, entryTags(entry)] as const)
          .filter(([, tags]) => tags.length > 0)
      ),
    [livePicklist.row]
  );
  // The host's live picklist notes on teams, shown in the team popup (also kept after it ends).
  const liveNotes = useMemo(
    () =>
      new Map(
        (livePicklist.row?.entries ?? [])
          .filter((entry) => entry.note?.trim())
          .map((entry) => [entry.teamNumber, entry.note!] as const)
      ),
    [livePicklist.row]
  );

  const openLivePicklist = () =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set("live", "1");
        return params;
      },
      { state: { fromPicklist: true } }
    );
  const closeLivePicklist = () => {
    if ((location.state as { fromPicklist?: boolean } | null)?.fromPicklist) {
      navigate(-1);
      return;
    }
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.delete("live");
        return params;
      },
      { replace: true }
    );
  };
  const handleEndLivePicklist = async () => {
    if (selectedPicklistEvent && !(devMode && isDevEventId(selectedPicklistEvent.id))) {
      await endLivePicklist(selectedPicklistEvent.id);
    }
    closeLivePicklist();
  };
  const pageInfo = liveOpen
    ? { title: "Live Picklist", description: null }
    : STRATEGY_PAGES[strategyPage];

  return (
    <div className="min-h-screen bg-background my-5">
      {/* The dashboard uses the full width so all six robots fit in a row on wide
          screens, and less padding so three fit across a phone. The live picklist is full
          width too, with the same padding at every size so its toolbar doesn't wrap and
          unwrap as the padding jumps. */}
      <main
        className={`mx-auto ${
          strategyPage === "dashboard" ? "w-full p-3 sm:p-6" : liveOpen ? "w-full p-6" : "container p-6 max-w-7xl"
        }`}
      >
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <ListOrdered className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">{pageInfo.title}</h1>
              {pageInfo.description && <p className="text-sm text-muted-foreground">{pageInfo.description}</p>}
            </div>
          </div>
          <UserProfileMenu userName={userName} userInitials={userInitials} avatarUrl={avatarUrl} />
        </div>

        <section>
          {/* On the Data page the event sits left and the data type right, on one line. On the
              Dashboard page the event sits left, and while a match is open the match toolbar
              (All matches, video) takes its place; the other pages keep the event dropdown on the right. */}
          <div className={`mb-4 flex gap-2 ${liveOpen ? "hidden" : ""} ${strategyPage === "data" ? "justify-between" : strategyPage === "dashboard" ? "justify-start" : "justify-end"}`}>
            {strategyPage === "picklist" && (
              <div className="mr-auto flex shrink-0 items-center gap-0.5">
                <Button
                  variant={isPicklistHost || picklistIsLive ? "default" : "outline"}
                  className="gap-1.5"
                  disabled={!isPicklistHost && !picklistIsLive}
                  onClick={openLivePicklist}
                >
                  {picklistIsLive ? (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                  ) : (
                    <Radio className="h-4 w-4" />
                  )}
                  {isPicklistHost ? (picklistIsLive ? "Open picklist" : "Start picklist") : "Live picklist"}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="About the live picklist">
                      <Info className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 text-sm">
                    {isPicklistHost
                      ? "You have been selected to be the picklist host! The day before playoff matches, initiate a picklist by pressing this button and share your screen to a TV. Your screen will receive live updates from everyone."
                      : picklistIsLive
                        ? "The live picklist is running! Open it to watch the host's list update live and suggest moving teams up or down."
                        : "Once the picklist host starts the live picklist, you can watch it here and suggest moving teams up or down."}
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {!(strategyPage === "dashboard" && matchOpen) && (
              <Select value={selectedPicklistEventId} onValueChange={setSelectedPicklistEventId}>
                <SelectTrigger className="w-full min-w-0 flex-1 sm:w-64 sm:flex-none" aria-label="Picklist event">
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
            )}
            {strategyPage === "dashboard" && (
              <div ref={setToolbarSlot} className="flex min-w-0 items-center" />
            )}
            {strategyPage === "picklist" && (
              <Button
                variant="outline"
                className="shrink-0 gap-1.5"
                disabled={picklistLoading || (pickedTeams.length === 0 && doNotPickTeams.length === 0)}
                onClick={() => setResetDialogOpen(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}
            {strategyPage === "data" && (
              <Select
                value={scoutingDataType}
                onValueChange={(value) => setScoutingDataType(value as ScoutingDataType)}
              >
                <SelectTrigger className="w-full min-w-0 flex-1 sm:w-64 sm:flex-none" aria-label="Scouting data type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOUTING_DATA_TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {strategyPage === "dashboard" ? (
            <MatchDashboard
              event={selectedPicklistEvent}
              userId={user?.id}
              userName={profile?.name ?? null}
              devMode={devMode}
              toolbarSlot={toolbarSlot}
              onMatchOpenChange={setMatchOpen}
              canEditVideos={!!profile?.is_manager}
            />
          ) : strategyPage === "teams" ? (
            <TeamInfoPage
              event={selectedPicklistEvent}
              userId={user?.id}
              userName={profile?.name ?? null}
              devMode={devMode}
            />
          ) : strategyPage === "data" ? (
            <ScoutingDataTable
              eventId={selectedPicklistEventId}
              dataType={scoutingDataType}
              userId={user?.id}
              userName={profile?.name ?? null}
              devMode={devMode}
            />
          ) : liveOpen ? (
            !selectedPicklistEvent || picklistLoading ? (
              <p className="text-muted-foreground">Loading event teams...</p>
            ) : isPicklistHost && user ? (
              <LivePicklist
                key={selectedPicklistEvent.id}
                event={selectedPicklistEvent}
                teams={allEventTeams}
                userId={user.id}
                userName={profile?.name ?? null}
                devMode={devMode}
                onExit={closeLivePicklist}
                onEnd={() => void handleEndLivePicklist()}
              />
            ) : !livePicklist.loaded && !(devMode && isDevEventId(selectedPicklistEvent.id)) ? (
              <p className="text-muted-foreground">Loading the live picklist...</p>
            ) : !picklistIsLive || !livePicklist.row ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  The live picklist for {selectedPicklistEvent.name} isn't running right now.
                </p>
                <Button variant="outline" className="mx-auto mt-4 w-fit" onClick={closeLivePicklist}>
                  Back to your picklist
                </Button>
              </Card>
            ) : (
              <LivePicklistViewer
                event={selectedPicklistEvent}
                userId={user?.id}
                teams={allEventTeams}
                live={livePicklist.row}
                onExit={closeLivePicklist}
                onTeamClick={(team) => {
                  setTeamInfoTeam(team);
                  setTeamInfoOpen(true);
                }}
              />
            )
          ) : strategyPage === "picklist" ? (
            <>
              <div className="mb-4 flex items-center gap-1 rounded-lg border p-1">
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
                  collisionDetection={picklistCollisionDetection}
                  onDragStart={handleDndDragStart}
                  onDragEnd={handleDndDragEnd}
                >
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 items-stretch">
                    <div className={mobilePicklistTab === "doNotPick" ? "hidden" : "h-full"}>
                      <PicklistColumn
                        columnKey="picklist"
                        title="Your Picklist"
                        teams={pickedTeams}
                        emptyMessage="Picklist goes here I think"
                        showRank
                        tags={liveTags}
                        onCardClick={(team) => {
                          setTeamInfoTeam(team);
                          setTeamInfoOpen(true);
                        }}
                        flyingTeam={flyingTeam}
                        onFlyDone={() => setFlyingTeam(null)}
                      />
                    </div>

                    <div className={mobilePicklistTab === "picklist" ? "hidden" : "h-full"}>
                      <PicklistColumn
                        columnKey="doNotPick"
                        title="Do Not Pick"
                        teams={doNotPickTeams}
                        emptyMessage="Skibidi"
                        showRank
                        tags={liveTags}
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
                              {xpLoading || scoutingAvgLoading ? (
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
                                setBankSortMode(value as "number" | "xp" | "scouting")
                              }
                            >
                              <DropdownMenuRadioItem value="number">
                                Team Number
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem value="xp">
                                xP Average (match13)
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
                      tags={liveTags}
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
                        <PicklistCardContent
                          team={activeDragTeam}
                          below={liveTags.get(activeDragTeam.team_number) && (
                            <TeamTags tags={liveTags.get(activeDragTeam.team_number)!} dots />
                          )}
                        />
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
            event={selectedPicklistEvent}
            userId={user?.id}
            userName={profile?.name ?? null}
            devMode={devMode}
            renderExtra={(teamNumber) => (
              <>
                {liveTags.has(teamNumber) && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-semibold">Tags</p>
                    </div>
                    <TeamTags tags={liveTags.get(teamNumber)!} />
                  </div>
                )}
                {liveNotes.has(teamNumber) && <LiveTeamNote note={liveNotes.get(teamNumber)!} />}
              </>
            )}
          />

          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Picklists?</DialogTitle>
                <DialogDescription>
                  This clears both Your Picklist and Do Not Pick
                  {selectedPicklistEvent ? ` for ${selectedPicklistEvent.name}` : ""}, moving
                  every team back to Available Teams. This can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleResetPicklists}>
                  Yes, Reset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        <nav className={`${liveOpen ? "hidden" : "flex"} fixed inset-x-4 bottom-4 z-30 mx-auto mt-8 max-w-xl items-center justify-center gap-1 rounded-xl border-2 border-border bg-card p-1 shadow-xl backdrop-blur`}>
          {(Object.keys(STRATEGY_PAGES) as StrategyPage[]).map((page) => (
            <Button
              key={page}
              size="sm"
              variant={strategyPage === page ? "default" : "ghost"}
              className={
                strategyPage === page
                  ? "flex-1 min-w-0 px-1.5 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm"
                  : "flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
              }
              onClick={() => setStrategyPage(page)}
            >
              {STRATEGY_PAGES[page].label}
            </Button>
          ))}
        </nav>
      </main>
    </div>
  );
}
