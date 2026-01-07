import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserMatches } from "@/lib/matches";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import type { Match, Role } from "@/types";

interface UserMatch {
  matchNumber: string;
  role: Role;
  match: Match;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [loading, setLoading] = useState(true);

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
                    className={`flex-shrink-0 w-64 h-64 ${getRoleColor(
                      userMatch.role
                    )} border-2 hover:scale-105 transition-transform cursor-pointer`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-2xl font-bold">
                          {userMatch.matchNumber}
                        </span>
                        <Badge
                          variant="outline"
                          className={getRoleBadgeColor(userMatch.role)}
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
                          <div className="text-xs">Role: {userMatch.role}</div>
                        </div>
                        <Button className="w-full mt-4" size="sm">
                          Start Scouting
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
      </main>
    </div>
  );
}
