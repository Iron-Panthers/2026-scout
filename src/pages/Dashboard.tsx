import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClipboardList, Wrench, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserMatches, removeUserFromMatch, getEvents } from "@/lib/matches";
import { getMatchTeam, getTeamPhoto, CURRENT_YEAR } from "@/lib/blueAlliance";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import type { Match, Role, Event } from "@/types";

export function prettifyRole(role) {
  switch (role) {
    case "red1":
      return "Red 1";
    case "red2":
      return "Red 2";
    case "red3":
      return "Red 3";
    case "qualRed":
      return "Qual Red";
    case "blue1":
      return "Blue 1";
    case "blue2":
      return "Blue 2";
    case "blue3":
      return "Blue 3";
    case "qualBlue":
      return "Qual Blue";
    default: 
      return "Unknown Role";
  }
}

interface UserMatch {
  matchNumber: string;
  role: Role;
  match: Match;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<UserMatch | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
    {}
  );
  const [teamPhoto, setTeamPhoto] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const navigate = useNavigate();

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Scout";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = user?.user_metadata?.avatar_url || "";

  // Load user's assigned matches
  useEffect(() => {
    const loadMatches = async () => {
      if (!user?.id) return;

      try {
        const { matches: userMatches } = await getUserMatches(user.id);

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

        // Sort by match number
        formattedMatches.sort(
          (a, b) => a.match.match_number - b.match.match_number
        );

        setMatches(formattedMatches);

        // Fetch team numbers for each match
        const events = await getEvents();
        const teamNumbersMap: Record<string, number | null> = {};

        for (const userMatch of formattedMatches) {
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
    };

    loadMatches();
  }, [user?.id]);

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
    setTeamPhoto(null);
    setLoadingPhoto(true);

    // Fetch team photo if not a qual role
    if (userMatch.role !== "qualRed" && userMatch.role !== "qualBlue") {
      const teamNumber = teamNumbers[`${userMatch.match.id}-${userMatch.role}`];
      if (teamNumber) {
        const photoUrl = await getTeamPhoto(teamNumber, CURRENT_YEAR);
        console.log(`Photo URL for team ${teamNumber}:`, photoUrl);
        setTeamPhoto(photoUrl);
      }
    }

    setLoadingPhoto(false);
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

  const handleQueueScouting = async () => {
    console.log(selectedMatch);
    navigate(`/config/${selectedMatch.match.id}`);
  }

  return (
    <div className="min-h-screen bg-background">
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

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button
            size="lg"
            className="h-24 text-lg font-semibold flex flex-col gap-2"
          >
            <ClipboardList className="h-8 w-8" />
            Match Scouting
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-24 text-lg font-semibold flex flex-col gap-2"
            asChild
          >
            <Link to="/pit-scouting">
              <Wrench className="h-8 w-8" />
              Pit Scouting
            </Link>
          </Button>
        </div>

        {/* Scheduled Matches Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Your Assigned Matches</h2>
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
              <div className="flex gap-4 min-w-min">
                {matches.map((userMatch, index) => (
                  <Card
                    key={`${userMatch.match.id}-${userMatch.role}`}
                    className={`flex-shrink-0 w-64 ${getRoleColor(
                      userMatch.role
                    )} border-2 hover:scale-105 transition-transform cursor-pointer`}
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
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Past Matches Section - TODO: Add completed matches tracking */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Past Matches</h2>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              Completed matches will appear here once you finish scouting.
            </p>
          </Card>
        </div>

        {/* Match Details Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center justify-between">
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

            <div className="space-y-4 py-4">
              {/* Robot Image */}
              <div className="w-full h-48 bg-muted rounded-lg flex items-center justify-center border-2 border-border overflow-hidden">
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
                    <p className="text-sm text-muted-foreground">
                      Not available
                    </p>
                  </div>
                )}
              </div>

              {/* Match Details */}
              <div className="space-y-3">
                {selectedMatch &&
                  teamNumbers[
                    `${selectedMatch.match.id}-${selectedMatch.role}`
                  ] && (
                    <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
                      <span className="text-sm font-medium text-muted-foreground">
                        Team Number
                      </span>
                      <span className="font-semibold">
                        {
                          teamNumbers[
                            `${selectedMatch.match.id}-${selectedMatch.role}`
                          ]
                        }
                      </span>
                    </div>
                  )}
                <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Your Role
                  </span>
                  <span className="font-semibold">{prettifyRole(selectedMatch?.role)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Match Type
                  </span>
                  <span className="font-semibold">Qualification</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Alliance
                  </span>
                  <span className="font-semibold">
                    {selectedMatch?.role.toLowerCase().includes("red")
                      ? "Red"
                      : "Blue"}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleDecline}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Decline
              </Button>
              <Button onClick={handleQueueScouting} className="flex-1">
                <ClipboardList className="h-4 w-4 mr-2" />
                Queue Scouting
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
