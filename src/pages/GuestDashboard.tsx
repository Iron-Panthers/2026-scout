import { useState, useEffect, useCallback } from "react";
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
import { ClipboardList, Wrench, X, RefreshCw, LogIn, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getUserMatches, removeUserFromMatch, getEvents } from "@/lib/matches";
import { getMatchTeam } from "@/lib/blueAlliance";
import { filterMatchesWithoutSubmissions } from "@/lib/scoutingSchema";
import { getUserPitAssignments, type UserPitAssignment } from "@/lib/pitScoutingAssignments";
import { clockIn, clockOut } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";
import DashboardHeader from "@/components/DashboardHeader";
import UserProfileMenu from "@/components/UserProfileMenu";
import OfflineMatches from "@/components/OfflineMatches";
import AnimatedContent from "@/components/AnimatedContent";
import { TeamImage } from "@/components/TeamImage";
import type { Match, Role, Event } from "@/types";
import { prettifyRole } from "@/lib/roleUtils";
export { prettifyRole };

interface UserMatch {
  matchNumber: string;
  role: Role;
  match: Match;
}

export default function GuestDashboard() {
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<UserMatch | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
    {}
  );
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-background my-5">
      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-7xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <DashboardHeader userName={"Guest"} />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          <Button
            size="lg"
            className="h-24 text-lg font-semibold flex flex-col gap-2"
            onClick={() => navigate("/config/?g=true")}
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

        {/* Offline Matches Section */}
        <div className="mb-8">
          <OfflineMatches />
        </div>
      </main>
    </div>
  );
}
