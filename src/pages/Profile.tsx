import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Calendar, CheckCircle2, ChevronRight, Camera, MessageCircle, Pencil, Save, Trophy, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import { getUserMatches } from "@/lib/matches";
import { getPublicProfile, uploadAvatar, updateProfile, type PublicProfile } from "@/lib/profiles";
import { getGameProfile } from "@/lib/gameProfiles";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { ScoutingMap } from "@/components/ScoutingMap";
import { TeamYears } from "@/components/TeamYears";
import { AddEventsDialog } from "@/components/AddEventsDialog";
import { AchievementIcon } from "@/components/AchievementIcon";
import { useAchievements } from "@/hooks/useAchievements";
import { getScoutedEvents, type ScoutedEvent } from "@/lib/scoutingHistory";
import type { Match } from "@/types";

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser, profile, getAvatarUrl, refreshProfile } = useAuth();
  // /profile is your own; /profile/:userId is someone else's (read-only), e.g. from Messages
  const { userId: routeUserId } = useParams();
  const isOwn = !routeUserId || routeUserId === authUser?.id;
  const viewedId = isOwn ? authUser?.id : routeUserId;
  const [otherProfile, setOtherProfile] = useState<PublicProfile | null>(null);
  const [otherLoaded, setOtherLoaded] = useState(false);
  const [userMatches, setUserMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [equippedCosmetics, setEquippedCosmetics] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [scoutedEvents, setScoutedEvents] = useState<ScoutedEvent[] | null>(null);
  const [addEventsOpen, setAddEventsOpen] = useState(false);

  useEffect(() => {
    const loadMatches = async () => {
      if (viewedId) {
        const { matches } = await getUserMatches(viewedId);
        setUserMatches(matches);
        setLoading(false);
      }
    };
    loadMatches();
  }, [viewedId]);

  useEffect(() => {
    if (!viewedId) return;
    getScoutedEvents(viewedId).then(setScoutedEvents);
  }, [viewedId]);

  useEffect(() => {
    if (!viewedId) return;
    if (isOwn) {
      getGameProfile(viewedId).then((gp) => {
        if (gp?.equipped_cosmetics) setEquippedCosmetics(gp.equipped_cosmetics);
      });
      return;
    }
    getPublicProfile(viewedId).then((other) => {
      setOtherProfile(other);
      setOtherLoaded(true);
      setEquippedCosmetics(other?.equipped_cosmetics ?? {});
    });
  }, [viewedId, isOwn]);

  // Worked out from the same scouting history as the map (shared, not loaded twice)
  const achievements = useAchievements(
    isOwn || otherLoaded ? viewedId : null,
    (isOwn ? profile?.team_years : otherProfile?.team_years) ?? [],
    scoutedEvents
  );

  const userName = isOwn
    ? profile?.name ||
      authUser?.user_metadata?.name ||
      authUser?.email?.split("@")[0] ||
      "User"
    : otherProfile?.name ?? (otherLoaded ? "Unknown user" : "Loading...");
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = isOwn ? getAvatarUrl() : otherProfile?.avatar_url ?? "";

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !authUser?.id) return;
    setUploading(true);
    await uploadAvatar(authUser.id, file);
    await refreshProfile();
    setUploading(false);
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartEditName = () => {
    setEditedName(userName);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    if (!authUser?.id || !editedName.trim()) return;
    setSavingName(true);
    const success = await updateProfile(authUser.id, { name: editedName.trim() });
    if (success) {
      await refreshProfile();
    }
    setSavingName(false);
    setIsEditingName(false);
  };

  const handleSaveTeamYears = async (years: number[]) => {
    if (!authUser?.id) return false;
    const success = await updateProfile(authUser.id, { team_years: years });
    if (success) await refreshProfile();
    return success;
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const email = isOwn ? authUser?.email || "" : "";
  const userRole = (isOwn ? profile?.role : otherProfile?.role) || "scout";
  const isManager = (isOwn ? profile?.is_manager : otherProfile?.is_manager) || false;
  const createdAt = isOwn ? profile?.created_at : otherProfile?.created_at;
  const joinDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : isOwn && authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "Recently";


  return (
    <div className="min-h-screen bg-background my-5">
      <main className="container mx-auto p-6 max-w-4xl">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="relative shrink-0">
                <CosmeticAvatar
                  avatarUrl={avatarUrl}
                  initials={userInitials}
                  equippedCosmetics={equippedCosmetics}
                  size="lg"
                  className="h-32 w-32"
                />
                {isOwn && (
                <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-1 right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                  aria-label="Change profile photo"
                >
                  <Camera className="h-4 w-4" />
                </button>
                </>
                )}
              </div>
              <div className="flex-1 text-center md:text-left">
                {isEditingName ? (
                  <div className="flex w-full items-center gap-2 justify-center md:w-auto md:justify-start mb-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="min-w-0 flex-1 text-2xl font-bold bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary md:flex-initial"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") handleCancelEditName();
                      }}
                    />
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleSaveName}
                      disabled={savingName}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelEditName}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <h1 className="text-3xl font-bold mb-2">{userName}</h1>
                    {isOwn && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleStartEditName}
                        className="mb-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-2 justify-center md:justify-start mb-4">
                  <Badge variant="secondary">
                    {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                  </Badge>
                  {isManager && <Badge variant="default">Manager</Badge>}
                </div>
                <div className="space-y-2 mt-4">
                  {email && (
                    <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm">{email}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Joined {joinDate}</span>
                  </div>
                  <TeamYears
                    years={(isOwn ? profile?.team_years : otherProfile?.team_years) ?? []}
                    onSave={isOwn ? handleSaveTeamYears : undefined}
                  />
                </div>
                {!isOwn && viewedId && (
                  <Button className="mt-4 gap-2" onClick={() => navigate(`/messages?with=${viewedId}`)}>
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events and account status side by side */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {scoutedEvents === null ? "..." : scoutedEvents.length}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <p className="text-lg font-semibold">Active</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Achievements: opens the full list (anyone can view anyone's) */}
        <Card
          className="mb-6 cursor-pointer transition-colors hover:bg-accent/40"
          role="button"
          tabIndex={0}
          onClick={() => viewedId && navigate(`/achievements/${viewedId}`)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && viewedId) navigate(`/achievements/${viewedId}`);
          }}
        >
          <CardContent className="flex items-center gap-4 py-4">
            <Trophy className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Achievements</p>
              <p className="text-sm text-muted-foreground">
                {achievements
                  ? `${achievements.filter((achievement) => achievement.earned).length}/${achievements.length} achievements`
                  : "Loading..."}
              </p>
            </div>
            {/* A few earned ones, as a preview */}
            <div className="hidden items-center -space-x-2 sm:flex">
              {achievements
                ?.filter((achievement) => achievement.earned)
                .slice(-5)
                .map((achievement) => (
                  <AchievementIcon key={achievement.id} icon={achievement.icon} earned size="sm" />
                ))}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Map of every event scouted at */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Events Scouted</CardTitle>
          </CardHeader>
          <CardContent>
            {scoutedEvents === null ? (
              <p className="text-muted-foreground text-center py-8">Loading events...</p>
            ) : scoutedEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {isOwn ? "No events yet. Events you scout at will show up here." : "No events scouted yet."}
              </p>
            ) : (
              <ScoutingMap events={scoutedEvents} />
            )}
            {/* Your own map: add events the app has no record of */}
            {isOwn && authUser?.id && scoutedEvents !== null && (
              <>
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setAddEventsOpen(true)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Incorrect?
                  </button>
                </div>
                <AddEventsDialog
                  open={addEventsOpen}
                  onOpenChange={setAddEventsOpen}
                  userId={authUser.id}
                  teamYears={profile?.team_years ?? []}
                  mapEvents={scoutedEvents}
                  onChanged={() => getScoutedEvents(authUser.id).then(setScoutedEvents)}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Match Assignments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Match Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-8">
                Loading assignments...
              </p>
            ) : userMatches.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No match assignments yet
              </p>
            ) : (
              <div className="space-y-3">
                {userMatches.slice(0, 5).map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                  >
                    <div>
                      <p className="font-semibold">{match.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Match #{match.match_number}
                      </p>
                    </div>
                    <Badge variant="outline">Assigned</Badge>
                  </div>
                ))}
                {userMatches.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    And {userMatches.length - 5} more...
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
