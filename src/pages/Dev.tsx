// Dev screen jst for debugging

import { getAllData, updateProfile } from "@/lib/profiles";
import { backfillMatchEventIds, getMatches } from "@/lib/matches";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function Dev() {
  const { toast } = useToast();
  const [isBackfilling, setIsBackfilling] = useState(false);

  const fetchProfiles = async () => {
    const profiles = await getAllData();
    console.log("All profiles:", profiles);
  };

  const { user: authUser, profile } = useAuth();

  const userName =
    profile?.name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split("@")[0] ||
    "User";

  const makeManager = async () => {
    updateProfile(authUser!.id, { is_manager: true });
  };

  const handleBackfillEventIds = async () => {
    setIsBackfilling(true);
    try {
      const result = await backfillMatchEventIds();

      if (result.success) {
        toast({
          title: "Success!",
          description: `Updated ${result.updated} matches with active event ID.`,
        });
      } else {
        toast({
          title: "Backfill Failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsBackfilling(false);
    }
  };

  const checkMatches = async () => {
    const matches = await getMatches();
    console.log("All matches:", matches);

    // Check for invalid IDs
    const invalidMatches = matches.filter(m => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return !uuidRegex.test(m.id);
    });

    if (invalidMatches.length > 0) {
      console.error("Found matches with invalid UUID ids:", invalidMatches);
      toast({
        title: "Invalid Match IDs Found",
        description: `${invalidMatches.length} matches have non-UUID ids. Check console.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "All Match IDs Valid",
        description: `All ${matches.length} matches have valid UUID ids.`,
      });
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Dev Page</h1>
      <p className="mb-4">You are {userName}</p>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Profile Tools</h2>
        <div className="flex gap-2">
          <Button
            onClick={fetchProfiles}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Fetch All Profiles
          </Button>
          <Button
            onClick={makeManager}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            {profile?.is_manager ? "Already manager" : "Make manager"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Database Utilities</h2>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleBackfillEventIds}
            disabled={isBackfilling}
            className="px-4 py-2 bg-green-500 text-white rounded"
          >
            {isBackfilling
              ? "Backfilling..."
              : "Backfill Match Event IDs"}
          </Button>
          <Button
            onClick={checkMatches}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Check Match IDs
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Sets event_id to the active event for all matches that don't have one.
        </p>
      </div>
    </div>
  );
}