import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Wrench } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import type { ScheduledMatch, PastMatch, Role } from "@/types";

// Mock data for scheduled matches
const scheduledMatches: ScheduledMatch[] = [
  {
    id: 1,
    scouterName: "Alex Chen",
    matchNumber: "Q-15",
    team: 5026,
    role: "red1",
    time: "10:30 AM",
  },
  {
    id: 2,
    scouterName: "Alex Chen",
    matchNumber: "Q-23",
    team: 1234,
    role: "blue2",
    time: "11:45 AM",
  },
  {
    id: 3,
    scouterName: "Alex Chen",
    matchNumber: "Q-31",
    team: 5678,
    role: "red3",
    time: "1:15 PM",
  },
  {
    id: 4,
    scouterName: "Alex Chen",
    matchNumber: "Q-42",
    team: 9012,
    role: "blue1",
    time: "2:30 PM",
  },
];

// Mock data for past matches
const pastMatches: PastMatch[] = [
  {
    id: 5,
    scouterName: "Alex Chen",
    matchNumber: "Q-8",
    team: 3456,
    role: "red2",
    time: "9:15 AM",
  },
  {
    id: 6,
    scouterName: "Alex Chen",
    matchNumber: "Q-4",
    team: 7890,
    role: "blue3",
    time: "8:30 AM",
  },
  {
    id: 7,
    scouterName: "Alex Chen",
    matchNumber: "Q-1",
    team: 2468,
    role: "qualRed",
    time: "8:00 AM",
  },
];

export default function Dashboard() {
  const scouterName = "Alex Chen";

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
          <DashboardHeader userName={scouterName} />
          <UserProfileMenu
            userName={scouterName}
            userInitials="AC"
            avatarUrl=""
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
          >
            <Wrench className="h-8 w-8" />
            Pit Scouting
          </Button>
        </div>

        {/* Scheduled Matches Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Scheduled Matches</h2>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-min">
              {scheduledMatches.map((match) => (
                <Card
                  key={match.id}
                  className={`flex-shrink-0 w-64 h-64 ${getRoleColor(
                    match.role
                  )} border-2 hover:scale-105 transition-transform cursor-pointer`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-2xl font-bold">
                        {match.matchNumber}
                      </span>
                      <Badge
                        variant="outline"
                        className={getRoleBadgeColor(match.role)}
                      >
                        {match.role.toUpperCase()}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">Team {match.team}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground mb-1">
                          {match.scouterName}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">
                            {match.time}
                          </span>
                        </div>
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
        </div>

        {/* Past Matches Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Past Matches</h2>
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-min">
              {pastMatches.map((match) => (
                <Card
                  key={match.id}
                  className="flex-shrink-0 w-64 h-64 bg-green-900/40 border-2 border-green-700/50 hover:scale-105 transition-transform cursor-pointer"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-2xl font-bold">
                        {match.matchNumber}
                      </span>
                      <Badge
                        variant="outline"
                        className="bg-green-600/20 text-green-400 border-green-600/30"
                      >
                        COMPLETED
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">Team {match.team}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 flex flex-col h-full">
                      <div className="text-sm text-muted-foreground flex-1">
                        <div className="font-semibold text-foreground mb-1">
                          {match.scouterName}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">
                            {match.time}
                          </span>
                        </div>
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={getRoleBadgeColor(match.role)}
                          >
                            {match.role.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <Button className="w-full" size="sm" variant="secondary">
                        View Report
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
