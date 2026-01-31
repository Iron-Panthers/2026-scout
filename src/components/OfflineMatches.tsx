import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  CloudOff,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  getOfflineMatches,
  deleteOfflineMatch,
  markAsUploaded,
  isApproachingQuota,
  getStorageSizeEstimate,
  type OfflineMatchData,
} from "@/lib/offlineStorage";
import {
  submitScoutingData,
  resolveMatchId,
} from "@/lib/scoutingSchema";
import { supabase } from "@/lib/supabase";
import { prettifyRole } from "@/pages/Dashboard";

interface OfflineMatchWithStatus extends OfflineMatchData {
  key: string;
  verifying: boolean;
  uploading: boolean;
  dbStatus: "unknown" | "uploaded" | "missing";
}

export default function OfflineMatches() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const [matches, setMatches] = useState<OfflineMatchWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [showQuotaWarning, setShowQuotaWarning] = useState(false);

  // Load offline matches
  const loadMatches = () => {
    const offlineMatches = getOfflineMatches();
    const matchesArray = Object.entries(offlineMatches).map(([key, match]) => ({
      ...match,
      key,
      verifying: false,
      uploading: false,
      dbStatus: "unknown" as const,
    }));

    // Sort by timestamp (newest first)
    matchesArray.sort((a, b) => b.timestamp - a.timestamp);

    setMatches(matchesArray);
    setLoading(false);

    // Check storage quota
    if (isApproachingQuota()) {
      setShowQuotaWarning(true);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  // Verify a match against the database
  const verifyMatch = async (match: OfflineMatchWithStatus): Promise<"uploaded" | "missing"> => {
    try {
      // First try to check by match_id and role
      if (match.matchId) {
        const { data, error } = await supabase
          .from("scouting_submissions")
          .select("id")
          .eq("match_id", match.matchId)
          .eq("role", match.role)
          .eq("scouter_id", match.scouterId || "")
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error verifying match:", error);
        }

        if (data) {
          return "uploaded";
        }
      }

      // Fallback: try to resolve match_id and check again
      if (match.eventCode && match.matchNumber) {
        const resolvedMatchId = await resolveMatchId(
          match.eventCode,
          match.matchNumber,
          match.role
        );

        if (resolvedMatchId) {
          const { data, error } = await supabase
            .from("scouting_submissions")
            .select("id")
            .eq("match_id", resolvedMatchId)
            .eq("role", match.role)
            .eq("scouter_id", match.scouterId || "")
            .maybeSingle();

          if (error && error.code !== "PGRST116") {
            console.error("Error verifying match with resolved ID:", error);
          }

          if (data) {
            return "uploaded";
          }
        }
      }

      return "missing";
    } catch (error) {
      console.error("Error verifying match:", error);
      return "missing"; // Assume not uploaded on error
    }
  };

  // Verify all matches against database
  const verifyAllMatches = async () => {
    const updatedMatches = [...matches];

    for (let i = 0; i < updatedMatches.length; i++) {
      if (updatedMatches[i].uploaded) {
        updatedMatches[i].verifying = true;
        setMatches([...updatedMatches]);

        const status = await verifyMatch(updatedMatches[i]);
        updatedMatches[i].dbStatus = status;
        updatedMatches[i].verifying = false;
        setMatches([...updatedMatches]);
      }
    }
  };

  // Run verification on mount
  useEffect(() => {
    if (matches.length > 0 && matches.some(m => m.uploaded)) {
      verifyAllMatches();
    }
  }, [matches.length]); // Only run when matches are first loaded

  // Upload a single match
  const uploadMatch = async (match: OfflineMatchWithStatus) => {
    try {
      // Update UI state
      const updatedMatches = matches.map(m =>
        m.key === match.key ? { ...m, uploading: true } : m
      );
      setMatches(updatedMatches);

      // Resolve match_id if needed
      let matchId = match.matchId;
      if (!matchId && match.eventCode && match.matchNumber) {
        matchId = await resolveMatchId(
          match.eventCode,
          match.matchNumber,
          match.role
        );
      }

      if (!matchId) {
        throw new Error("Could not resolve match ID");
      }

      // Submit to database
      await submitScoutingData(
        matchId,
        match.role,
        match.scoutingData,
        match.scouterId || user?.id
      );

      // Mark as uploaded in local storage
      markAsUploaded(match.key);

      // Update UI
      const finalMatches = matches.map(m =>
        m.key === match.key
          ? { ...m, uploading: false, uploaded: true, dbStatus: "uploaded" as const }
          : m
      );
      setMatches(finalMatches);

      toast({
        title: "Upload Successful",
        description: `Match ${match.matchNumber} (${prettifyRole(match.role)}) uploaded`,
      });
    } catch (error) {
      console.error("Error uploading match:", error);

      // Update UI to stop loading
      const updatedMatches = matches.map(m =>
        m.key === match.key ? { ...m, uploading: false } : m
      );
      setMatches(updatedMatches);

      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  // Upload all pending matches
  const uploadAllMatches = async () => {
    const pendingMatches = matches.filter(m => !m.uploaded);
    if (pendingMatches.length === 0) {
      toast({
        title: "No Pending Matches",
        description: "All matches have already been uploaded",
      });
      return;
    }

    setUploadingAll(true);

    let successCount = 0;
    let failCount = 0;

    for (const match of pendingMatches) {
      try {
        await uploadMatch(match);
        successCount++;
      } catch (error) {
        console.error("Error uploading match:", error);
        failCount++;
      }
    }

    setUploadingAll(false);

    if (failCount === 0) {
      toast({
        title: "All Matches Uploaded",
        description: `Successfully uploaded ${successCount} match${successCount !== 1 ? "es" : ""}`,
      });
    } else {
      toast({
        title: "Upload Complete with Errors",
        description: `${successCount} succeeded, ${failCount} failed`,
        variant: "destructive",
      });
    }
  };

  // Delete a match from offline storage
  const deleteMatch = (key: string) => {
    deleteOfflineMatch(key);
    setMatches(matches.filter(m => m.key !== key));
    toast({
      title: "Match Deleted",
      description: "Match removed from offline storage",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" />
            Offline Matches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (matches.length === 0) {
    return null; // Don't show card if no offline matches
  }

  const pendingMatches = matches.filter(m => !m.uploaded);
  const uploadedMatches = matches.filter(m => m.uploaded);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" />
            Offline Matches
            {pendingMatches.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingMatches.length} pending
              </Badge>
            )}
            {/* Network Status Indicator */}
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-600" title="Online" />
            ) : (
              <WifiOff className="h-4 w-4 text-yellow-600" title="Offline" />
            )}
          </CardTitle>
          {pendingMatches.length > 0 && (
            <Button
              onClick={uploadAllMatches}
              disabled={uploadingAll || !isOnline}
              size="sm"
              variant="default"
              title={!isOnline ? "Cannot upload while offline" : undefined}
            >
              {uploadingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload All
                </>
              )}
            </Button>
          )}
        </div>
        {/* Quota Warning */}
        {showQuotaWarning && (
          <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            Storage is almost full. Consider uploading and clearing old matches.
          </div>
        )}
        {/* Offline Warning */}
        {!isOnline && pendingMatches.length > 0 && (
          <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded text-sm text-blue-800 dark:text-blue-200">
            <WifiOff className="h-4 w-4 inline mr-2" />
            You're offline. Matches will be uploaded when connection is restored.
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Pending Matches */}
          {pendingMatches.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Pending Upload ({pendingMatches.length})
              </h3>
              <div className="space-y-2">
                {pendingMatches.map((match) => (
                  <MatchRow
                    key={match.key}
                    match={match}
                    onUpload={uploadMatch}
                    onDelete={deleteMatch}
                    isOnline={isOnline}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Uploaded Matches */}
          {uploadedMatches.length > 0 && (
            <div className={pendingMatches.length > 0 ? "mt-6" : ""}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Uploaded ({uploadedMatches.length})
              </h3>
              <div className="space-y-2">
                {uploadedMatches.map((match) => (
                  <MatchRow
                    key={match.key}
                    match={match}
                    onUpload={uploadMatch}
                    onDelete={deleteMatch}
                    isOnline={isOnline}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Individual match row component
function MatchRow({
  match,
  onUpload,
  onDelete,
  isOnline,
}: {
  match: OfflineMatchWithStatus;
  onUpload: (match: OfflineMatchWithStatus) => void;
  onDelete: (key: string) => void;
  isOnline?: boolean;
}) {
  const formattedDate = new Date(match.timestamp).toLocaleString();

  return (
    <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            Match {match.matchNumber}
          </span>
          <Badge variant="outline">{prettifyRole(match.role)}</Badge>
          {match.uploaded ? (
            match.verifying ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : match.dbStatus === "uploaded" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : match.dbStatus === "missing" ? (
              <AlertCircle className="h-4 w-4 text-yellow-600" title="Not found in database" />
            ) : null
          ) : (
            <Badge variant="destructive" className="text-xs">Not Uploaded</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {match.eventCode} • {formattedDate}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!match.uploaded && (
          <Button
            onClick={() => onUpload(match)}
            disabled={match.uploading || !isOnline}
            size="sm"
            variant="default"
            title={!isOnline ? "Cannot upload while offline" : undefined}
          >
            {match.uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="mr-1 h-3 w-3" />
                Upload
              </>
            )}
          </Button>
        )}
        {match.uploaded && (
          <Button
            onClick={() => onDelete(match.key)}
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
