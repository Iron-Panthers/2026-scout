import { useAuth } from "@/contexts/AuthContext";
import {
  CURRENT_YEAR,
  getEventMatches,
  getMatchTeam,
  getTeamPhoto,
} from "@/lib/blueAlliance";
import { getEvents, getMatch, getMatches, getUserMatches } from "@/lib/matches";
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
import { ArrowLeft, Lock } from "lucide-react";
import type { Match } from "@/types";

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
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [teamPhoto, setTeamPhoto] = useState<string | null>(null);
  const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
    {}
  );
  const [manualMode, setManualMode] = useState(!param_match_id);

  // Role locking state
  const [lockedRole, setLockedRole] = useState<string | null>(null);
  const [lockedMatchType, setLockedMatchType] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<{type: 'role' | 'matchType', value: string} | null>(null);

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

            // Fetch team photo if not a qual role
            if (match_role !== "qualRed" && match_role !== "qualBlue") {
              const photoUrl = await getTeamPhoto(teamNumber, CURRENT_YEAR);
              if (photoUrl) {
                setTeamPhoto(photoUrl);
              }
            }
          }
        } catch (error) {
          console.log("Could not fetch team info (offline?):", error);
        }
      }
    };

    loadMatchData();
  }, [param_match_id, user?.id]);

  const updateTeamNum = async () => {
    // Skip for qual roles - they don't have specific team numbers
    if (role === "qualRed" || role === "qualBlue") {
      setTeamNumber(0);
      setTeamPhoto(null);
      return;
    }

    if (matchType === "Practice" || matchType === "Playoff") return;
    if (!matchNumber || !role || !eventCode) return;

    try {
      setLoadingPhoto(true);
      const teamNumber = await getMatchTeam(eventCode, matchNumber, role);

      if (teamNumber) {
        setTeamNumber(teamNumber);

        // Fetch team photo
        const photoUrl = await getTeamPhoto(teamNumber, CURRENT_YEAR);
        if (photoUrl) {
          setTeamPhoto(photoUrl);
        }
      } else {
        console.log("Could not find team number (offline or match not in TBA)");
      }
    } catch (error) {
      console.log("Could not fetch team info (offline?):", error);
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Auto-fetch team number when match number or role changes
  useEffect(() => {
    if (matchNumber !== 0 && role !== "") {
      updateTeamNum();
    }
  }, [matchNumber, role, eventCode]);

  const canStart = role && eventCode && matchNumber > 0;
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
      className="space-y-3 py-4 grid place-items-center"
      style={{ padding: "20px" }}
    >
      {/* Back Button */}
      <div className="w-full max-w-sm mb-2">
        <Button variant="ghost" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

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

            const params = new URLSearchParams({
              match_id: match_id || "", // Can be empty, will be resolved later
              role: role,
              event_code: eventCode,
              match_number: matchNumber.toString(),
              team_number: teamNumber.toString(),
              match_type: matchType
            });

            const url = `/scouting?${params.toString()}`;
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
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Tabs defaultValue="config" className="">
          <TabsContent value="config" className="">
            {/* Robot Image */}
            <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center border-2 border-border overflow-hidden mb-2">
              {loadingPhoto ? (
                <div className="text-center">
                  <p className="text-muted-foreground font-semibold">
                    Loading...
                  </p>
                </div>
              ) : teamPhoto ? (
                <img
                  src={teamPhoto}
                  alt="Robot"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    console.error("Failed to load image:", teamPhoto);
                    e.currentTarget.style.display = "none";
                    e.currentTarget.parentElement!.innerHTML = `
                        <div class="text-center">
                          <p class="text-muted-foreground font-semibold">Robot Image</p>
                          <p class="text-sm text-muted-foreground">Failed to load</p>
                        </div>
                      `;
                  }}
                />
              ) : (
                <div className="text-center">
                  <p className="text-muted-foreground font-semibold">
                    Robot Image
                  </p>
                  <p className="text-sm text-muted-foreground">Not available</p>
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
              <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">
                  Team Number
                </span>
                <Input
                  className="font-semibold w-30 text-right"
                  type="number"
                  placeholder={role === "qualRed" || role === "qualBlue" ? "N/A for qual scouting" : "#####"}
                  onInput={(e) => {
                    setTeamNumber(parseInt(e.currentTarget.value));
                  }}
                  value={role === "qualRed" || role === "qualBlue" ? "" : teamNumber}
                  disabled={role === "qualRed" || role === "qualBlue"}
                />
              </div>
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
                    <DropdownMenuContent className="w-fit h-fit rounded-lg shadow-md border border-border bg-popover">
                      <DropdownMenuItem
                        className="p-2 px-7 bg-primary border-b rounded-lg"
                        onClick={() => handleRoleChange("red1")}
                      >
                        Red 1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-primary border-b rounded-lg"
                        onClick={() => handleRoleChange("red2")}
                      >
                        Red 2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-primary border-b rounded-lg"
                        onClick={() => handleRoleChange("red3")}
                      >
                        Red 3
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-primary border-b rounded-lg"
                        onClick={() => handleRoleChange("qualRed")}
                      >
                        Qual Red
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-chart-5 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue1")}
                      >
                        Blue 1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-chart-5 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue2")}
                      >
                        Blue 2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-chart-5 border-b rounded-lg"
                        onClick={() => handleRoleChange("blue3")}
                      >
                        Blue 3
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="p-2 px-7 bg-chart-5 border-b rounded-lg"
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
                    <DropdownMenuContent className="w-fit h-fit rounded-lg shadow-md border border-border bg-popover">
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
                  <DropdownMenuContent className="w-fit max-h-64 overflow-y-auto rounded-lg shadow-md border border-border bg-popover">
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
            <p>:skull:</p>
          </TabsContent>
          <TabsList className="sticky h-8 left-0 w-full text-center bottom-0 mt-6 bg-background/95 backdrop-blur-sm pb-2">
            <TabsTrigger
              value="config"
              className="w-2/5 pw-10 py-2 data-[state=active]:border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mx-1"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="game"
              className="w-2/5 pw-10 py-2 data-[state=active]:border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mx-1"
            >
              Games
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
    </div>
  );
}
