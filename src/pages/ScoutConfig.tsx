import { useAuth } from "@/contexts/AuthContext";
import {
  CURRENT_YEAR,
  getEventMatches,
  getMatchTeam,
} from "@/lib/blueAlliance";
import { getEvents, getMatch, getMatches, getUserMatches } from "@/lib/matches";
import { TeamImage } from "@/components/TeamImage";
import React, { useState, useEffect } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { prettifyRole } from "./Dashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@radix-ui/react-tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Lock, Coins } from "lucide-react";
import type { Match, GameDefinition, GameProfile } from "@/types";
import { GAMES } from "@/config/games";
import { getGameProfile, purchaseGame } from "@/lib/gameProfiles";
import { GameCard } from "@/components/GameCard";
import { GamePurchaseDialog } from "@/components/GamePurchaseDialog";
import { GamePlayer } from "@/components/GamePlayer";

export default function ScoutConfig() {
  const { match_id: param_match_id } = useParams();
  const [search_params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [match_id, setMatchId] = useState(param_match_id || "");
  const [matchType, setMatchType] = useState("Qualification");
  const [matchNumber, setMatchNumber] = useState(0);
  const [teamNumber, setTeamNumber] = useState(0);
  const [role, setRole] = useState(search_params.get("role") || "");
  const [eventId, setEventId] = useState("");
  const [eventCode, setEventCode] = useState("");
  const [eventName, setEventName] = useState("");
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
    {}
  );
  const [manualMode, setManualMode] = useState(!param_match_id);
  const [isTeamNumberAutofilled, setIsTeamNumberAutofilled] = useState(false);
  const [qualTeamNumbers, setQualTeamNumbers] = useState<[number, number, number]>([0, 0, 0]);

  // Role locking state
  const [lockedRole, setLockedRole] = useState<string | null>(null);
  const [lockedMatchType, setLockedMatchType] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{type: 'role' | 'matchType', value: string} | null>(null);
  const [showTeamNumberUnlockDialog, setShowTeamNumberUnlockDialog] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState("config");

  // Game shop state
  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [gameProfileLoading, setGameProfileLoading] = useState(false);
  const [buyingGame, setBuyingGame] = useState<GameDefinition | null>(null);
  const [activeGame, setActiveGame] = useState<GameDefinition | null>(null);

  // Load active event on mount
  useEffect(() => {
    const loadActiveEvent = async () => {
      const events = await getEvents();
      setAvailableEvents(events);

      const activeEvent = events.find((event) => event.is_active);

      if (activeEvent) {
        setEventId(activeEvent.id);
        setEventCode(activeEvent.event_code || "");
        setEventName(activeEvent.name || "");
        console.log("Loaded active event:", activeEvent.name, activeEvent.id);
      } else if (events.length > 0) {
        // If no active event, use the first one
        setEventId(events[0].id);
        setEventCode(events[0].event_code || "");
        setEventName(events[0].name || "");
        console.warn("No active event found, using first event");
      } else {
        console.warn("No events found");
      }
    };

    loadActiveEvent();
  }, []);

  // Load match data if match_id is provided
  useEffect(() => {
    const loadMatchData = async () => {
      if (!param_match_id) {
        console.log("No match_id provided, entering manual mode");
        setManualMode(true);
        return;
      }

      const match = await getMatch(param_match_id);
      if (!match) {
        console.log("Match not found, entering manual mode");
        setManualMode(true);
        return;
      }

      // Determine user's role in this match
      let match_role = "";
      if (role != "") {
        match_role = role;
      } else if (user?.id) {
        const roleChecks = [
          { id: match.blue1_scouter_id, role: "blue1" },
          { id: match.blue2_scouter_id, role: "blue2" },
          { id: match.blue3_scouter_id, role: "blue3" },
          { id: match.qual_blue_scouter_id, role: "qualBlue" },
          { id: match.red1_scouter_id, role: "red1" },
          { id: match.red2_scouter_id, role: "red2" },
          { id: match.red3_scouter_id, role: "red3" },
          { id: match.qual_red_scouter_id, role: "qualRed" },
        ];

        const assignedRole = roleChecks.find((r) => r.id === user.id);
        match_role = assignedRole?.role || "";
      }

      if (!match_role) {
        console.log(
          "User not assigned to match, allowing manual role selection"
        );
      }

      // Get the event from the match's event_id
      let matchEvent = null;
      if (match.event_id) {
        const events = await getEvents();
        matchEvent = events.find((event) => event.id === match.event_id);

        if (matchEvent) {
          setEventId(matchEvent.id);
          setEventCode(matchEvent.event_code || "");
          setEventName(matchEvent.name || "");
          console.log(
            "Loaded event from match:",
            matchEvent.name,
            matchEvent.id
          );
        } else {
          console.warn("Event not found for match.event_id:", match.event_id);
        }
      } else {
        console.warn("Match has no event_id");
      }

      // Set match data
      setMatchNumber(match.match_number || 0);
      if (match_role) {
        setRole(match_role);
        // Lock the role since user is assigned
        setLockedRole(match_role);
        setLockedMatchType("Qualification");
      }
      setManualMode(false);

      // Try to fetch team number if we have the data
      if (matchEvent?.event_code && match.match_number && match_role) {
        try {
          const teamNumber = await getMatchTeam(
            matchEvent.event_code,
            match.match_number,
            match_role
          );

          if (teamNumber) {
            setTeamNumber(teamNumber);
            setIsTeamNumberAutofilled(true);
          }
        } catch (error) {
          console.log("Could not fetch team info (offline?):", error);
        }
      }
    };

    loadMatchData();
  }, [param_match_id, user?.id]);

  const updateTeamNum = async () => {
    if (matchType === "Practice" || matchType === "Playoff") return;
    if (!matchNumber || !role || !eventCode) return;

    const isQualRole = role === "qualRed" || role === "qualBlue";

    if (isQualRole) {
      // Fetch all 3 team numbers for the alliance
      const alliance = role === "qualRed" ? "red" : "blue";
      try {
        const nums = await Promise.all(
          [1, 2, 3].map((i) => getMatchTeam(eventCode, matchNumber, `${alliance}${i}`))
        );
        const resolved: [number, number, number] = [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
        if (resolved.some((n) => n > 0)) {
          setQualTeamNumbers(resolved);
        }
      } catch (error) {
        console.log("Could not fetch qual team numbers (offline?):", error);
      }
    } else {
      try {
        const teamNumber = await getMatchTeam(eventCode, matchNumber, role);
        if (teamNumber) {
          setTeamNumber(teamNumber);
          setIsTeamNumberAutofilled(true);
        } else {
          console.log("Could not find team number (offline or match not in TBA)");
        }
      } catch (error) {
        console.log("Could not fetch team info (offline?):", error);
      }
    }
  };

  // Auto-fetch team number when match number or role changes
  useEffect(() => {
    if (matchNumber !== 0 && role !== "") {
      updateTeamNum();
    }
  }, [matchNumber, role, eventCode]);

  // Load game profile once when user is available
  useEffect(() => {
    if (!user?.id) return;
    setGameProfileLoading(true);
    getGameProfile(user.id).then((profile) => {
      setGameProfile(profile);
      setGameProfileLoading(false);
    });
  }, [user?.id]);

  async function handlePurchase(game: GameDefinition) {
    if (!user?.id) return;
    const result = await purchaseGame(user.id, game.id, game.cost);
    if (!result.success) throw new Error(result.error ?? "Purchase failed.");
    // Refresh profile after successful purchase
    const updated = await getGameProfile(user.id);
    setGameProfile(updated);
    setBuyingGame(null);
  }

  const canStart = role && eventCode && matchNumber > 0;

  const startUrl = canStart
    ? (() => {
        const isQualRole = role === "qualRed" || role === "qualBlue";
        const params = new URLSearchParams({
          match_id: match_id || "",
          role,
          event_code: eventCode,
          match_number: matchNumber.toString(),
          team_number: teamNumber.toString(),
          match_type: matchType,
          ...(isQualRole && {
            team1: qualTeamNumbers[0].toString(),
            team2: qualTeamNumbers[1].toString(),
            team3: qualTeamNumbers[2].toString(),
          }),
        });
        return isQualRole ? `/qual-scouting?${params}` : `/scouting?${params}`;
      })()
    : null;
  const getMissingFields = () => {
    const missing = [];
    if (!role) missing.push("role");
    if (!eventCode) missing.push("event");
    if (matchNumber <= 0) missing.push("match number");
    return missing;
  };

  // Handle role change with confirmation if locked
  const handleRoleChange = (newRole: string) => {
    if (lockedRole && newRole !== lockedRole) {
      setPendingChange({ type: 'role', value: newRole });
      setConfirmDialogOpen(true);
    } else {
      setRole(newRole);
    }
  };

  // Handle match type change with confirmation if locked
  const handleMatchTypeChange = (newMatchType: string) => {
    if (lockedMatchType && newMatchType !== lockedMatchType) {
      setPendingChange({ type: 'matchType', value: newMatchType });
      setConfirmDialogOpen(true);
    } else {
      setMatchType(newMatchType);
    }
  };

  // Confirm the pending change
  const confirmChange = () => {
    if (pendingChange) {
      if (pendingChange.type === 'role') {
        setRole(pendingChange.value);
        setLockedRole(null); // Unlock after manual override
      } else {
        setMatchType(pendingChange.value);
        setLockedMatchType(null); // Unlock after manual override
      }
    }
    setConfirmDialogOpen(false);
    setPendingChange(null);
  };

  // Cancel the pending change
  const cancelChange = () => {
    setConfirmDialogOpen(false);
    setPendingChange(null);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ padding: "20px" }}
    >
      {/* Back Button */}
      <div className="w-full max-w-sm mx-auto mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center space-y-3 pb-16">
      <div className="sticky top-0 z-40 w-full bg-background pt-1 pb-2">
      <Button
        onClick={() => {
          // Require at minimum: role, event_id, and match_number
          if (canStart) {
            console.log("ScoutConfig navigating with:", {
              match_id: match_id || "",
              role,
              eventCode,
              matchNumber,
            });

            // Route to qual scouting page for qual roles
            const isQualRole = role === "qualRed" || role === "qualBlue";
            const params = new URLSearchParams({
              match_id: match_id || "", // Can be empty, will be resolved later
              role: role,
              event_code: eventCode,
              match_number: matchNumber.toString(),
              team_number: teamNumber.toString(),
              match_type: matchType,
              ...(isQualRole && {
                team1: qualTeamNumbers[0].toString(),
                team2: qualTeamNumbers[1].toString(),
                team3: qualTeamNumbers[2].toString(),
              }),
            });

            const url = isQualRole
              ? `/qual-scouting?${params.toString()}`
              : `/scouting?${params.toString()}`;
            console.log("Navigation URL:", url);
            navigate(url);
          }
        }}
        size="lg"
        variant={canStart ? "default" : "secondary"}
        className={`h-20 text-lg flex flex-col gap-2 ${
          canStart ? "font-semibold" : "text-muted-foreground"
        }`}
        style={{ width: "100%" }}
      >
        <span>{canStart ? "Start Scouting" : "Configure Match"}</span>
        {!canStart && (
          <span className="text-xs font-normal">
            Missing: {getMissingFields().join(", ")}
          </span>
        )}
      </Button>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="">
          <TabsContent value="config" className="">
            {/* Robot Image */}
            <div className="w-full h-40 bg-muted rounded-lg border-2 border-border overflow-hidden mb-2">
              {role !== "qualRed" && role !== "qualBlue" && teamNumber > 0 ? (
                <TeamImage
                  teamNumber={teamNumber}
                  eventId={eventId || undefined}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-muted-foreground font-semibold">
                      Robot Image
                    </p>
                    <p className="text-sm text-muted-foreground">Not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Match Details */}
            <div className="space-y-2">
              <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Match Number
                </span>
                <Input
                  className="font-semibold w-30 text-right"
                  type="number"
                  placeholder="#####"
                  onInput={(e) => {
                    setMatchNumber(parseInt(e.currentTarget.value));
                  }}
                  value={matchNumber}
                />
              </div>
              {role === "qualRed" || role === "qualBlue" ? (
                <div className="flex flex-col gap-1">
                  {([0, 1, 2] as const).map((i) => (
                    <div key={i} className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                      <span className="text-sm font-medium text-muted-foreground">
                        Team {i + 1}
                      </span>
                      <Input
                        className="font-semibold w-30 text-right"
                        type="number"
                        placeholder="#####"
                        value={qualTeamNumbers[i] || ""}
                        onInput={(e) => {
                          const val = parseInt(e.currentTarget.value) || 0;
                          setQualTeamNumbers((prev) => {
                            const next: [number, number, number] = [...prev];
                            next[i] = val;
                            return next;
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Team Number
                  </span>
                  <div className="flex items-center gap-2">
                    {isTeamNumberAutofilled && (
                      <button
                        type="button"
                        onClick={() => setShowTeamNumberUnlockDialog(true)}
                        className="hover:bg-accent/50 rounded p-1 transition-colors"
                        aria-label="Unlock team number for editing"
                      >
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                    <Input
                      className="font-semibold w-30 text-right"
                      type="number"
                      placeholder="#####"
                      onInput={(e) => {
                        setTeamNumber(parseInt(e.currentTarget.value));
                      }}
                      value={teamNumber}
                      readOnly={isTeamNumberAutofilled}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center p-1 pl-3 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Your Role
                </span>
                <div className="flex items-center gap-2">
                  {lockedRole && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <p className="px-7 bg-accent-foreground/10 p-2 border-b rounded-lg">
                        {role ? prettifyRole(role) : "Select Role"}
                        {lockedRole && role === lockedRole && " (Assigned)"}
                      </p>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent collisionPadding={{ bottom: 56 }} className="w-40 h-fit rounded-lg shadow-md border border-primary bg-popover overflow-y-scroll max-h-35">
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("red1")}
                      >
                        Red 1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("red2")}
                      >
                        Red 2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("red3")}
                      >
                        Red 3
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("qualRed")}
                      >
                        Qual Red
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue1")}
                      >
                        Blue 1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue2")}
                      >
                        Blue 2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue3")}
                      >
                        Blue 3
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 border-b rounded-lg"
                        onClick={() => handleRoleChange("qualBlue")}
                      >
                        Qual Blue
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Match Type
                </span>
                <div className="flex items-center gap-2">
                  {lockedMatchType && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <p className="px-7 bg-accent-foreground/10 p-2 border-b rounded-lg">
                        {matchType}
                        {lockedMatchType && matchType === lockedMatchType && " (Assigned)"}
                      </p>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent collisionPadding={{ bottom: 56 }} className="w-fit h-fit rounded-lg shadow-md border border-primary bg-popover">
                      <DropdownMenuItem
                        className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg"
                        onClick={() => handleMatchTypeChange("Qualification")}
                      >
                        Qualification
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg"
                        onClick={() => handleMatchTypeChange("Playoff")}
                      >
                        Playoff
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg"
                        onClick={() => handleMatchTypeChange("Practice")}
                      >
                        Practice
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Event
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <p className="px-7 bg-accent-foreground/10 p-2 border-b rounded-lg truncate max-w-[200px]">
                      {eventName || "Select Event"}
                    </p>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent collisionPadding={{ bottom: 56 }} className="w-fit max-h-64 overflow-y-auto rounded-lg shadow-md border border-border bg-popover">
                    {availableEvents.map((event) => (
                      <DropdownMenuItem
                        key={event.id}
                        className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg"
                        onClick={() => {
                          setEventId(event.id);
                          setEventCode(event.event_code || "");
                          setEventName(event.name || "");
                        }}
                      >
                        {event.name}
                        {event.is_active && " (Active)"}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Event Code
                </span>
                <Input
                  className="font-semibold w-40 text-right"
                  type="text"
                  placeholder="2025cave"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="game">
            {/* Points balance header */}
            <div className="flex items-center justify-between px-3 py-2 mb-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium text-muted-foreground">Your Points</span>
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-yellow-500" />
                {gameProfileLoading ? (
                  <span className="text-sm text-muted-foreground">…</span>
                ) : (
                  <span className="text-sm font-semibold">{gameProfile?.points ?? 0}</span>
                )}
              </div>
            </div>

            {/* Game grid */}
            {gameProfileLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {GAMES.map((g) => (
                  <div
                    key={g.id}
                    className="rounded-lg border border-border bg-muted animate-pulse aspect-[4/3]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {GAMES.map((game) => {
                  const isUnlocked =
                    game.cost === 0 ||
                    (gameProfile?.unlocked_games ?? []).includes(game.id);
                  return (
                    <GameCard
                      key={game.id}
                      game={game}
                      isUnlocked={isUnlocked}
                      userPoints={gameProfile?.points ?? 0}
                      onBuy={() => setBuyingGame(game)}
                      onPlay={() => setActiveGame(game)}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Tab Buttons - Fixed at bottom */}
          <TabsList className="fixed h-10 left-0 right-0 w-full text-center bottom-0 bg-background border-t border-border z-50">
            <TabsTrigger
              value="config"
              className="w-2/5 py-2 data-[state=active]:border-t-2 data-[state=active]:border-primary bg-background hover:bg-accent hover:text-accent-foreground mx-1"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="game"
              className="w-2/5 py-2 data-[state=active]:border-t-2 data-[state=active]:border-primary bg-background hover:bg-accent hover:text-accent-foreground mx-1"
            >
              Games
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Assignment?</DialogTitle>
            <DialogDescription>
              You're assigned to {lockedRole ? prettifyRole(lockedRole) : ""} for this match.
              {pendingChange?.type === 'role' && (
                <> Are you sure you want to change to {prettifyRole(pendingChange.value)}?</>
              )}
              {pendingChange?.type === 'matchType' && (
                <> Are you sure you want to change the match type to {pendingChange.value}?</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelChange}>
              Cancel
            </Button>
            <Button onClick={confirmChange}>
              Yes, Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Number Unlock Dialog */}
      <Dialog open={showTeamNumberUnlockDialog} onOpenChange={setShowTeamNumberUnlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Team Number?</DialogTitle>
            <DialogDescription>
              This team number ({teamNumber}) was automatically fetched from The Blue Alliance.
              Are you sure you want to unlock it for manual editing? This may cause data inconsistencies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTeamNumberUnlockDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setIsTeamNumberAutofilled(false);
              setShowTeamNumberUnlockDialog(false);
            }}>
              Yes, Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Game purchase dialog */}
      <GamePurchaseDialog
        game={buyingGame}
        userPoints={gameProfile?.points ?? 0}
        onConfirm={handlePurchase}
        onClose={() => setBuyingGame(null)}
      />

      {/* Full-screen game player */}
      <GamePlayer
        game={activeGame}
        onClose={() => setActiveGame(null)}
        startUrl={startUrl}
        onStartWithoutConfig={() => {
          setActiveGame(null);
          setActiveTab("config");
        }}
      />
    </div>
  );
}
