import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Calendar, CheckCircle2, Clock, Camera, Pencil, Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from "react";
import { getUserMatches } from "@/lib/matches";
import { uploadAvatar, updateProfile } from "@/lib/profiles";
import { getGameProfile } from "@/lib/gameProfiles";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import type { Match } from "@/types";

export default function Profile() {
  const navigate = useNavigate();
  const { user: authUser, profile, getAvatarUrl, refreshProfile } = useAuth();
  const [userMatches, setUserMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [equippedCosmetics, setEquippedCosmetics] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    const loadMatches = async () => {
      if (authUser?.id) {
        const { matches } = await getUserMatches(authUser.id);
        setUserMatches(matches);
        setLoading(false);
      }
    };
    loadMatches();
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser?.id) return;
    getGameProfile(authUser.id).then((gp) => {
      if (gp?.equipped_cosmetics) setEquippedCosmetics(gp.equipped_cosmetics);
    });
  }, [authUser?.id]);

  const userName =
    profile?.name ||
    authUser?.user_metadata?.name ||
    authUser?.email?.split("@")[0] ||
    "User";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl = getAvatarUrl();

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

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const email = authUser?.email || "";
  const userRole = profile?.role || "scout";
  const isManager = profile?.is_manager || false;
  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "Recently";

  const totalMatches = userMatches.length;
  const uniqueEvents = new Set(userMatches.map((m) => m.event_id)).size;

  return (
    <div className="min-h-screen bg-background my-15">
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
              </div>
              <div className="flex-1 text-center md:text-left">
                {isEditingName ? (
                  <div className="flex items-center gap-2 justify-center md:justify-start -mb-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="text-2xl font-bold bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleStartEditName}
                      className="mb-2"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex gap-2 justify-center md:justify-start mb-4">
                  <Badge variant="secondary">
                    {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                  </Badge>
                  {isManager && <Badge variant="default">Manager</Badge>}
                </div>
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">{email}</span>
                  </div>
                  <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Joined {joinDate}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Assigned Matches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {loading ? "..." : totalMatches}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {loading ? "..." : uniqueEvents}
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Next Match
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-blue-500" />
                <p className="text-lg font-semibold">
                  {totalMatches > 0 ? "Upcoming" : "None"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

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
