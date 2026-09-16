import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ClipboardList,
  Wrench,
  X,
  RefreshCw,
  LogIn,
  LogOut,
  ListOrdered,
  ArrowUpDown,
  Loader2,
  ShoppingBag,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserMatches, removeUserFromMatch, getEvents } from "@/lib/matches";
import { getMatchTeam, getEventTeams, type TBATeamSimple } from "@/lib/blueAlliance";
import { getEventEpaMap } from "@/lib/statbotics";
import { filterMatchesWithoutSubmissions, getEventScoutingAverages } from "@/lib/scoutingSchema";
import { getPicklist, upsertPicklist } from "@/lib/picklists";
import { getUserPitAssignments, type UserPitAssignment } from "@/lib/pitScoutingAssignments";
import { clockIn, clockOut } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import OfflineMatches from "@/components/OfflineMatches";
import AnimatedContent from "@/components/AnimatedContent";
import { TeamImage } from "@/components/TeamImage";
import { TeamLogo } from "@/components/TeamLogo";
import { TeamInfoDialog } from "@/components/TeamInfoDialog";
import type { Match, Role, Event } from "@/types";
import { prettifyRole } from "@/lib/roleUtils";
export { prettifyRole };

interface UserMatch {
  matchNumber: string;
  role: Role;
  match: Match;
}

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
}: SortablePicklistCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: team.team_number,
    data: { column },
  });

  return (
    <div
      ref={setNodeRef}
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
}

function PicklistColumn({
  columnKey,
  title,
  headerAction,
  teams,
  emptyMessage,
  showRank,
  onCardClick,
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
        className="flex max-h-[424px] min-h-32 flex-col gap-2 overflow-y-auto rounded-lg border border-dashed p-1.5"
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
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, profile, getAvatarUrl, refreshProfile } = useAuth();
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<UserMatch | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
    {}
  );
  const [pitAssignments, setPitAssignments] = useState<UserPitAssignment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clockingIn, setClocingIn] = useState(false);
  const [dashboardPage, setDashboardPage] = useState<"scout" | "picklist">("scout");
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
  const [picklistEvents, setPicklistEvents] = useState<Event[]>([]);
  const [selectedPicklistEventId, setSelectedPicklistEventId] = useState("");
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
  const [teamInfoTeam, setTeamInfoTeam] = useState<TBATeamSimple | null>(null);
  const [mobilePicklistTab, setMobilePicklistTab] = useState<"picklist" | "doNotPick">(
    "picklist"
  );

  const navigate = useNavigate();

  const userName =
    profile?.name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Scout";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = getAvatarUrl();

  // Load user's assigned matches
  const loadMatches = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { matches: userMatches } = await getUserMatches(user.id, true);

      // Convert matches to display format with role information
      const formattedMatches: UserMatch[] = [];

      userMatches.forEach((match) => {
        // Check each role to find where the user is assigned
        const roleChecks: Array<{ column: string | null; role: Role }> = [
          { column: match.red1_scouter_id, role: "red1" },
          { column: match.red2_scouter_id, role: "red2" },
          { column: match.red3_scouter_id, role: "red3" },
          { column: match.qual_red_scouter_id, role: "qualRed" },
          { column: match.blue1_scouter_id, role: "blue1" },
          { column: match.blue2_scouter_id, role: "blue2" },
          { column: match.blue3_scouter_id, role: "blue3" },
          { column: match.qual_blue_scouter_id, role: "qualBlue" },
        ];

        roleChecks.forEach(({ column, role }) => {
          if (column === user.id) {
            formattedMatches.push({
              matchNumber: match.name,
              role,
              match,
            });
          }
        });
      });

      // Filter out matches that already have submissions
      const matchesWithoutSubmissions = await filterMatchesWithoutSubmissions(
        formattedMatches
      );

      setMatches(matchesWithoutSubmissions);

      // Fetch team numbers for each match
      const events = await getEvents();
      const teamNumbersMap: Record<string, number | null> = {};

      for (const userMatch of matchesWithoutSubmissions) {
        // Skip qual roles
        if (userMatch.role === "qualRed" || userMatch.role === "qualBlue") {
          continue;
        }

        // Find the event for this match
        const event = events.find((e) => e.id === userMatch.match.event_id);

        if (event?.event_code) {
          const teamNumber = await getMatchTeam(
            event.event_code,
            userMatch.match.match_number,
            userMatch.role
          );

          if (teamNumber) {
            teamNumbersMap[`${userMatch.match.id}-${userMatch.role}`] =
              teamNumber;
          }
        }
      }

      setTeamNumbers(teamNumbersMap);
    } catch (error) {
      console.error("Failed to load matches:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Load pit scouting assignments for current user
  const loadPitAssignments = useCallback(async () => {
    if (!user?.id) return;
    const data = await getUserPitAssignments(user.id);
    setPitAssignments(data);
  }, [user?.id]);

  useEffect(() => {
    loadPitAssignments();
  }, [loadPitAssignments]);

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

  // Re-fetch whenever the user navigates back to this tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadMatches();
        loadPitAssignments();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadMatches, loadPitAssignments]);

  // Subscribe to real-time updates for match assignments and submissions
  useEffect(() => {
    if (!user?.id) return;

    console.log("Setting up realtime subscriptions for matches and submissions...");

    // Subscribe to changes in matches table and scouting_submissions table
    const channel = supabase
      .channel("scout-dashboard-updates")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "matches",
        },
        (payload) => {
          console.log("Match assignment changed:", payload);
          // Reload matches when any match is updated
          loadMatches();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scouting_submissions",
        },
        (payload) => {
          console.log("Scouting submission changed:", payload);
          loadMatches();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qual_scouting_submissions",
        },
        (payload) => {
          console.log("Qual scouting submission changed:", payload);
          loadMatches();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pit_scouting_assignments",
        },
        () => {
          loadPitAssignments();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pit_scouting_submissions",
        },
        () => {
          loadPitAssignments();
        }
      )
      .subscribe();

    return () => {
      console.log("Cleaning up realtime subscriptions...");
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadMatches, loadPitAssignments]);

  const getRoleColor = (role: string) => {
    if (role.startsWith("red") || role === "qualRed") {
      return "bg-red-900/40 border-red-700/50";
    }
    return "bg-blue-900/40 border-blue-700/50";
  };

  const getRoleBadgeColor = (role: string) => {
    if (role.startsWith("red") || role === "qualRed") {
      return "bg-red-600/20 text-red-400 border-red-600/30";
    }
    return "bg-blue-600/20 text-blue-400 border-blue-600/30";
  };

  const handleMatchClick = async (userMatch: UserMatch) => {
    setSelectedMatch(userMatch);
    setDialogOpen(true);
  };

  const handleDecline = async () => {
    if (!selectedMatch || !user?.id) return;

    const success = await removeUserFromMatch(
      selectedMatch.match.id,
      user.id,
      selectedMatch.role
    );

    if (success) {
      // Remove from local state
      setMatches((prev) =>
        prev.filter(
          (m) =>
            !(
              m.match.id === selectedMatch.match.id &&
              m.role === selectedMatch.role
            )
        )
      );
      setDialogOpen(false);
    } else {
      console.error("Failed to decline match");
    }
  };

  const handleClockIn = async () => {
    if (!user?.id) return;
    setClocingIn(true);
    await clockIn(user.id);
    await refreshProfile();
    setClocingIn(false);
  };

  const handleClockOut = async () => {
    if (!user?.id) return;
    setClocingIn(true);
    await clockOut(user.id);
    await refreshProfile();
    setClocingIn(false);
  };

  const handleQueueScouting = async () => {
    if (!selectedMatch) return;
    console.log("Selected match:", selectedMatch);
    console.log("Match ID:", selectedMatch.match.id);
    console.log("Match Name:", selectedMatch.match.name);
    console.log("Match object:", selectedMatch.match);

    // Validate that we have a UUID
    const matchId = selectedMatch.match.id;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!matchId || !uuidRegex.test(matchId)) {
      console.error("Invalid match ID format:", matchId);
      alert(`Invalid match ID: ${matchId}. Expected UUID format.`);
      return;
    }

    navigate(`/config/${matchId}?role=${selectedMatch?.role}`);
  };

  const clockInBar = (
    <>
      {profile?.clocked_in ? (
        <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-700/40 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="mx-5 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <div>
              <p className="font-semibold text-red-400">Clocked In</p>
              <p className="text-xs text-muted-foreground">You're in stands!</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={clockingIn}
            className="h-16 border-red-700/40 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            onClick={handleClockOut}
          >
            {clockingIn ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 mr-1.5" />
            )}
            Clock Out
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          disabled={clockingIn}
          className="w-full h-20 lg:h-full text-lg"
          onClick={handleClockIn}
        >
          {clockingIn ? (
            <Loader2 className="h-6 w-6 mr-2 animate-spin" />
          ) : (
            <LogIn className="h-6 w-6 mr-2" />
          )}
          {Math.random() < 0.02 ? "Lock In" : "Clock In"}
        </Button>
      )}
    </>
  );

  const selectedPicklistEvent = picklistEvents.find(
    (event) => event.id === selectedPicklistEventId
  );

  return (
    <div className="min-h-screen bg-background my-5">
      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-7xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <DashboardHeader userName={userName} />
          <UserProfileMenu
            userName={userName}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
          />
        </div>

        {dashboardPage === "scout" ? (
          <>
        {/* Clock In bar — above grid on small screens */}
        <div className="lg:hidden mb-4 space-y-2">
          {clockInBar}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-0">
          {/* Clock In / Out — in grid on sm+ screens */}
          <div className="hidden lg:block mb-6 space-y-2 h-full">
            {clockInBar}
          </div>
          <Button
            size="lg"
            className="h-24 text-lg font-semibold flex flex-col gap-2"
            onClick={() => navigate("/config/")}
          >
            <ClipboardList className="h-8 w-8" />
            Match Scouting
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-24 text-lg font-semibold flex flex-col gap-2 items-center"
          >
            <Link to="/pit-scouting" className="flex flex-col items-center gap-2">
              <Wrench className="h-8 w-8" />
              Pit Scouting
            </Link>
          </Button>
          
        </div>

        {/* Pit Scouting Assignments Section */}
        {pitAssignments.length > 0 && (
          <div className="my-8">
            <h2 className="text-2xl font-bold mb-4">
              Your Pit Scouting Assignments
            </h2>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-min items-stretch">
                {pitAssignments.map((assignment, index) => (
                  <AnimatedContent
                    key={assignment.id}
                    direction="horizontal"
                    distance={50}
                    duration={0.5}
                    delay={index * 0.1}
                    threshold={0.2}
                    className="flex-shrink-0 flex"
                  >
                    <Card
                      className={`w-64 flex flex-col border-2 hover:scale-[1.02] transition-transform cursor-pointer ${
                        assignment.isRescout
                          ? "bg-yellow-900/40 border-yellow-700/50"
                          : "bg-green-900/40 border-green-700/50"
                      }`}
                      onClick={() =>
                        navigate(`/pit-scouting?team=${assignment.team_number}`)
                      }
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              assignment.isRescout
                                ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30"
                                : "bg-green-600/20 text-green-400 border-green-600/30"
                            }`}
                          >
                            {assignment.isRescout ? "Rescout" : "Pit Scout"}
                          </Badge>
                        </div>
                        <CardTitle className="text-3xl font-bold font-mono">
                          {assignment.team_number}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">
                            <div className="font-semibold text-foreground mb-1">
                              {userName}
                            </div>
                            <div className="text-xs">{assignment.event_name}</div>
                          </div>
                          <Button
                            className={`w-full mt-4 ${
                              assignment.isRescout
                                ? "bg-yellow-700 hover:bg-yellow-600"
                                : "bg-green-700 hover:bg-green-600"
                            }`}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/pit-scouting?team=${assignment.team_number}`);
                            }}
                          >
                            <Wrench className="h-4 w-4 mr-1" />
                            {assignment.isRescout ? "Update Entry" : "Scout Pit"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </AnimatedContent>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scheduled Matches Section */}
        <div className="my-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold">Your Assigned Matches</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await Promise.all([loadMatches(), loadPitAssignments()]);
                setRefreshing(false);
              }}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {loading ? (
            <div className="text-muted-foreground">Loading matches...</div>
          ) : matches.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">
                No matches assigned yet. Check back later or contact your
                manager.
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-min items-stretch">
                {matches.map((userMatch, index) => (
                  <AnimatedContent
                    key={`${userMatch.match.id}-${userMatch.role}`}
                    direction="horizontal"
                    distance={50}
                    duration={0.5}
                    delay={index * 0.1}
                    threshold={0.2}
                    className="flex-shrink-0 flex"
                  >
                    <Card
                      className={`w-64 flex flex-col ${getRoleColor(
                        userMatch.role
                      )} border-2 hover:scale-[1.02] transition-transform cursor-pointer`}
                      onClick={() => handleMatchClick(userMatch)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <span className="font-mono text-2xl font-bold">
                            {userMatch.matchNumber}
                          </span>
                          <Badge
                            variant="outline"
                            className={`${getRoleBadgeColor(
                              userMatch.role
                            )} whitespace-nowrap text-xs`}
                          >
                            {userMatch.role.toUpperCase()}
                          </Badge>
                        </div>
                        <CardTitle className="text-lg">
                          Match #{userMatch.match.match_number}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">
                            <div className="font-semibold text-foreground mb-1">
                              {userName}
                            </div>
                            <div className="text-xs break-words">
                              Role: {userMatch.role}
                            </div>
                            {teamNumbers[
                              `${userMatch.match.id}-${userMatch.role}`
                            ] && (
                              <div className="text-xs font-semibold text-foreground mt-1">
                                Team:{" "}
                                {
                                  teamNumbers[
                                    `${userMatch.match.id}-${userMatch.role}`
                                  ]
                                }
                              </div>
                            )}
                          </div>
                          <Button
                            className="w-full mt-4"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMatchClick(userMatch);
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </AnimatedContent>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Offline Matches Section */}
        <div className="mb-8">
          <OfflineMatches />
        </div>
          </>
        ) : (
          <section className="my-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <ListOrdered className="h-7 w-7 text-primary" />
                <div>
                  <h2 className="text-2xl font-bold">Picklist</h2>
                  <p className="text-sm text-muted-foreground">
                    Sort teams however you want! This list is only visible for you.
                  </p>
                </div>
              </div>
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
                  />
                </div>

                <DragOverlay>
                  {activeDragTeam ? (
                    <Card className="cursor-grabbing gap-0 py-0 shadow-lg">
                      <PicklistCardContent team={activeDragTeam} />
                    </Card>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            <TeamInfoDialog
              open={teamInfoOpen}
              onOpenChange={setTeamInfoOpen}
              teamNumber={teamInfoTeam?.team_number ?? null}
              nickname={teamInfoTeam?.nickname}
              eventId={selectedPicklistEvent?.id}
              eventCode={selectedPicklistEvent?.event_code}
            />
          </section>
        )}

        {/* Match Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-[425px] md:max-w-[600px] p-3 landscape:px-4 landscape:py-2 md:p-6">
            <DialogHeader className="space-y-1 landscape:space-y-0.5 md:space-y-2">
              <DialogTitle className="text-lg md:text-2xl flex items-center justify-between pr-6">
                <span>{selectedMatch?.matchNumber}</span>
                <Badge
                  variant="outline"
                  className={
                    selectedMatch ? getRoleBadgeColor(selectedMatch.role) : ""
                  }
                >
                  {selectedMatch?.role.toUpperCase()}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Match #{selectedMatch?.match.match_number}
              </DialogDescription>
            </DialogHeader>

            {/* Two-column layout on landscape/small screens, stacked on portrait and desktop */}
            <div className="flex flex-col landscape:flex-row landscape:md:flex-col gap-3 landscape:gap-3 landscape:md:gap-4 py-3 landscape:py-2 landscape:md:py-4">
              {/* Robot Image */}
              <div className="w-full landscape:w-44 landscape:md:w-full landscape:flex-shrink-0 landscape:md:flex-shrink h-32 sm:h-40 md:h-48 landscape:h-full landscape:min-h-[180px] landscape:md:min-h-0 landscape:md:h-48 bg-muted rounded-lg border-2 border-border overflow-hidden">
                {selectedMatch && selectedMatch.role !== "qualRed" && selectedMatch.role !== "qualBlue" ? (
                  <TeamImage
                    teamNumber={teamNumbers[`${selectedMatch.match.id}-${selectedMatch.role}`] || 0}
                    eventId={selectedMatch.match.event_id || undefined}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-xs md:text-sm text-muted-foreground font-semibold">
                      Robot Image
                    </p>
                  </div>
                )}
              </div>

              {/* Match Details - grows to fill remaining space */}
              <div className="space-y-2 landscape:space-y-2 landscape:md:space-y-3 flex-1 landscape:flex landscape:flex-col landscape:justify-between landscape:md:block">
                <div className="space-y-2 landscape:space-y-2 landscape:md:space-y-3">
                  {selectedMatch &&
                    teamNumbers[
                      `${selectedMatch.match.id}-${selectedMatch.role}`
                    ] && (
                      <div className="flex justify-between items-center p-2 landscape:p-2 md:p-3 bg-accent/50 rounded-lg">
                        <span className="text-xs sm:text-sm md:text-sm font-medium text-muted-foreground">
                          Team Number
                        </span>
                        <span className="text-sm sm:text-base md:text-base font-semibold">
                          {
                            teamNumbers[
                              `${selectedMatch.match.id}-${selectedMatch.role}`
                            ]
                          }
                        </span>
                      </div>
                    )}
                  <div className="flex justify-between items-center p-2 landscape:p-2 md:p-3 bg-accent/50 rounded-lg">
                    <span className="text-xs sm:text-sm md:text-sm font-medium text-muted-foreground">
                      Your Role
                    </span>
                    <span className="text-sm sm:text-base md:text-base font-semibold">
                      {selectedMatch ? prettifyRole(selectedMatch.role) : ""}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 landscape:p-2 md:p-3 bg-accent/50 rounded-lg">
                    <span className="text-xs sm:text-sm md:text-sm font-medium text-muted-foreground">
                      Match Type
                    </span>
                    <span className="text-sm sm:text-base md:text-base font-semibold">
                      Qualification
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 landscape:p-2 md:p-3 bg-accent/50 rounded-lg">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                      Alliance
                    </span>
                    <span className="text-sm sm:text-base font-semibold">
                      {selectedMatch?.role.toLowerCase().includes("red")
                        ? "Red"
                        : "Blue"}
                    </span>
                  </div>
                </div>

                {/* Footer buttons in landscape mode only (not desktop) */}
                <div className="landscape:flex landscape:flex-col landscape:gap-2 landscape:md:hidden hidden">
                  <Button
                    variant="outline"
                    onClick={handleDecline}
                    className="w-full h-8"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">Decline</span>
                  </Button>
                  <Button onClick={handleQueueScouting} className="w-full h-8">
                    <ClipboardList className="h-3.5 w-3.5 mr-1" />
                    <span className="text-xs">Queue</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer buttons in portrait mode and desktop */}
            <DialogFooter className="flex-col sm:flex-row gap-2 landscape:hidden landscape:md:flex">
              <Button
                variant="outline"
                onClick={handleDecline}
                className="w-full sm:flex-1 h-10"
              >
                <X className="h-4 w-4 mr-1.5" />
                <span className="text-sm">Decline</span>
              </Button>
              <Button
                onClick={handleQueueScouting}
                className="w-full sm:flex-1 h-10"
              >
                <ClipboardList className="h-4 w-4 mr-1.5" />
                <span className="text-sm">Queue Scouting</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <nav className="fixed inset-x-4 bottom-4 z-30 mx-auto mt-8 flex max-w-xl items-center justify-center gap-1 rounded-xl border-2 border-border bg-card p-1 shadow-xl backdrop-blur">
          <Button
            size="sm"
            variant={dashboardPage === "scout" ? "default" : "ghost"}
            className={
              dashboardPage === "scout"
                ? "flex-1 min-w-0 px-1.5 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm"
                : "flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            }
            onClick={() => setDashboardPage("scout")}
          >
            <ClipboardList className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Scout
          </Button>
          <Button
            size="sm"
            variant={dashboardPage === "picklist" ? "default" : "ghost"}
            className={
              dashboardPage === "picklist"
                ? "flex-1 min-w-0 px-1.5 text-xs font-semibold shadow-sm sm:px-3 sm:text-sm"
                : "flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            }
            onClick={() => setDashboardPage("picklist")}
          >
            <ListOrdered className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Picklist
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            onClick={() => navigate("/shop")}
          >
            <ShoppingBag className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Shop
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            onClick={() => navigate("/avatar")}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Avatar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-1.5 text-xs text-muted-foreground hover:text-foreground sm:px-3 sm:text-sm"
            onClick={() => navigate("/betting")}
          >
            <TrendingUp className="mr-1 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Betting
          </Button>
        </nav>
      </main>
    </div>
  );
}
