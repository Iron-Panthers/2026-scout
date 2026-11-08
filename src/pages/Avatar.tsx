import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, Camera, Mail, MessageCircle, Pencil, Save, ShoppingBag, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { getGameProfile } from "@/lib/gameProfiles";
import { equipCosmetic, unequipCosmetic } from "@/lib/shopService";
import {
  COSMETICS,
  RARITY_CONFIG,
  RARITY_VALUE,
  isLimitedCosmetic,
  THEME_BACKGROUNDS_SETTING,
  themeValueFor,
  type CosmeticDefinition,
  type ThemeBackground,
} from "@/config/cosmetics";
import { ThemeBackgroundToggle } from "@/components/ThemeBackgroundToggle";
import { SEASONAL_ITEM_COLOR, seasonalEventName } from "@/config/seasonalEvents";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { useToast } from "@/hooks/use-toast";
import { useRandomSubtitle } from "@/hooks/useRandomSubtitle";
import { AVATAR_SUBTITLES } from "@/config/headerSubtitles";
import type { GameProfile } from "@/types";
import { Badge } from "@/components/ui/badge";
import { TeamYears } from "@/components/TeamYears";
import { updateProfile } from "@/lib/profiles";
import Shop from "./Shop";

export default function AvatarPage({
  embedded = false,
  onVisitShop,
}: { embedded?: boolean; onVisitShop?: () => void } = {}) {
  const navigate = useNavigate();
  const { user, profile, getAvatarUrl, refreshProfile } = useAuth();
  const { userId: routeUserId } = useParams();
  const isOwn = !routeUserId || routeUserId === user?.id;
  const { toast } = useToast();
  const { settings, updateSetting } = useSettings();
  const subtitle = useRandomSubtitle(AVATAR_SUBTITLES);

  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"hats" | "decorations" | "themes">("hats");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [scoutedEvents, setScoutedEvents] = useState<ScoutedEvent[] | null>(null);
  const [addEventsOpen, setAddEventsOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    const gp = await getGameProfile(user.id);
    setGameProfile(gp);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const owned = gameProfile?.owned_cosmetics ?? [];
  const equipped = gameProfile?.equipped_cosmetics ?? {};
  const eventCosmeticSources = gameProfile?.event_cosmetic_sources ?? {};
  // Each theme's chosen background (for themes with a Light/Dark choice), kept in this browser's settings
  const themeBackgrounds: Record<string, ThemeBackground> = settings[THEME_BACKGROUNDS_SETTING] ?? {};

  const userName =
    profile?.name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user?.id) return;
      setUploading(true);
      await uploadAvatar(user.id, file);
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
      if (!user?.id || !editedName.trim()) return;
      setSavingName(true);
      const success = await updateProfile(user.id, { name: editedName.trim() });
      if (success) {
        await refreshProfile();
      }
      setSavingName(false);
      setIsEditingName(false);
    };
  
    const handleSaveTeamYears = async (years: number[]) => {
      if (!user?.id) return false;
      const success = await updateProfile(user.id, { team_years: years });
      if (success) await refreshProfile();
      return success;
    };
  
    const handleCancelEditName = () => {
      setIsEditingName(false);
      setEditedName("");
    };
  
    const email = isOwn ? user?.email || "" : "";
    const userRole = (isOwn ? profile?.role : otherProfile?.role) || "scout";
    const isManager = (isOwn ? profile?.is_manager : otherProfile?.is_manager) || false;
    const createdAt = isOwn ? profile?.created_at : otherProfile?.created_at;
    const joinDate = createdAt
      ? new Date(createdAt).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : isOwn && user?.created_at
      ? new Date(user.created_at).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      : "Recently";
  

  async function handleEquip(item: CosmeticDefinition) {
    if (!user?.id) return;
    // Reflect the equip immediately — the button/badge/avatar preview
    // shouldn't wait on the round-trip to feel responsive. We already know
    // exactly what the resulting state is, so on success we trust this
    // local update as-is rather than re-fetching: a re-fetch here can race
    // the write and resolve with the pre-equip data, snapping the UI back
    // to the old cosmetic before flipping again on the *next* interaction.
    // Only re-sync from the server if the write actually failed.
    setGameProfile((prev) =>
      prev
        ? { ...prev, equipped_cosmetics: { ...(prev.equipped_cosmetics ?? {}), [item.category]: item.id } }
        : prev
    );
    if (item.category === "theme" && item.themeValue) {
      updateSetting("theme", themeValueFor(item, themeBackgrounds[item.id]));
    }
    const result = await equipCosmetic(user.id, item.category, item.id);
    if (result.success) {
      toast({ title: `${item.name} equipped!` });
    } else {
      toast({ title: "Failed to equip", description: result.error, variant: "destructive" });
      loadProfile();
    }
  }

  // Switches the theme live when it's the one equipped
  function handleSetBackground(item: CosmeticDefinition, background: ThemeBackground) {
    updateSetting(THEME_BACKGROUNDS_SETTING, { ...themeBackgrounds, [item.id]: background });
    if (equipped[item.category] === item.id) {
      updateSetting("theme", themeValueFor(item, background));
    }
  }

  async function handleUnequip(item: CosmeticDefinition) {
    if (!user?.id) return;
    setGameProfile((prev) => {
      if (!prev) return prev;
      const nextEquipped = { ...(prev.equipped_cosmetics ?? {}) };
      delete nextEquipped[item.category];
      return { ...prev, equipped_cosmetics: nextEquipped };
    });
    if (item.category === "theme") {
      updateSetting("theme", "dark");
    }
    const result = await unequipCosmetic(user.id, item.category);
    if (result.success) {
      toast({ title: `${item.name} unequipped.` });
    } else {
      toast({ title: "Failed to unequip", description: result.error, variant: "destructive" });
      loadProfile();
    }
  }

  // Common up to legendary, then event items (competition and seasonal) after them all;
  // each group by rarity, then cost
  const rarityCompare = (a: CosmeticDefinition, b: CosmeticDefinition) =>
    Number(isLimitedCosmetic(a)) - Number(isLimitedCosmetic(b)) ||
    (a.rarity === b.rarity ? a.cost - b.cost : RARITY_VALUE[a.rarity] - RARITY_VALUE[b.rarity]);

  const ownedItems = COSMETICS.filter((c) => owned.includes(c.id) || c.default);
  const hats = ownedItems.filter((c) => c.category === "hat").sort(rarityCompare);
  const decorations = ownedItems.filter((c) => c.category === "decoration").sort(rarityCompare);
  const themes = ownedItems.filter((c) => c.category === "theme").sort(rarityCompare);

  function renderSection(items: CosmeticDefinition[], emptyMessage: string) {
    if (items.length === 0) {
      return (
        <div className="text-center py-10 space-y-3">
          <p className="text-muted-foreground">{emptyMessage}</p>
          <Button onClick={() => (onVisitShop ? onVisitShop() : navigate("/shop"))}>
            Visit the Shop
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((item) => {
            const isEquipped = equipped[item.category] === item.id;
            // The event it's from: where a competition event item was bought, or its seasonal event
            const eventSource = eventCosmeticSources[item.id] ?? seasonalEventName(item.seasonalEvent);
            const cardColor = item.seasonalEvent ? SEASONAL_ITEM_COLOR : RARITY_CONFIG[item.rarity].color;
            return (
              <Card
                key={item.id}
                className="relative overflow-hidden border pt-0"
                style={{
                  borderColor: cardColor,
                  // A 10% tint of the card's color
                  backgroundColor: `${cardColor}1A`,
                }}
              >
                <CardContent className="h-50 p-4 flex flex-col pb-0">
                  {eventSource && (
                    <div className={`-mx-4 -mt-4 flex shrink-0 items-center justify-center gap-1 border-b px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      item.seasonalEvent && !eventCosmeticSources[item.id]
                        ? "border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-300"
                        : "border-sky-500/30 bg-sky-500/15 text-sky-300"
                    }`}>
                      {eventSource}
                    </div>
                  )}
                  <div className="min-h-0 flex-1 flex flex-col items-center justify-center gap-3">
                    {item.emoji && <div className="text-5xl leading-none select-none">{item.emoji}</div>}
                    {item.url && <img className="w-10 select-none" src={item.url} />}
                    <div className="text-center space-y-0.5 w-full">
                      <p className="font-semibold text-sm" style={{ color: RARITY_CONFIG[item.rarity].color }}>
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
                    </div>
                  </div>
                  {item.lightThemeValue && (
                    <ThemeBackgroundToggle
                      className="mb-2"
                      value={themeBackgrounds[item.id] ?? "dark"}
                      onChange={(background) => handleSetBackground(item, background)}
                    />
                  )}
                  {isEquipped ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 mt-auto"
                      onClick={() => handleUnequip(item)}
                    >
                      Unequip
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full text-xs bg-green-700 hover:bg-green-600 text-white mt-auto"
                      onClick={() => handleEquip(item)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Equip
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? undefined : "min-h-screen bg-background"}>
      <div className="max-w-xl mx-auto md:max-w-none px-4 py-5 space-y-5">
        {!embedded && (
          <div className="flex items-center gap-3 ml-5">
            <Button variant="ghost" size="sm" className="gap-2 px-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2 ml-5">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <span className="text-2xl font-bold block">My Profile</span>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main layout: stacked on mobile, sidebar+content on md+ */}
        <div className="flex flex-col md:flex-row gap-5 justify-center">
          {/* Avatar sidebar */}
          <div className="w-full md:w-100 md:shrink-0 md:sticky md:top-6 h-full">
            <Card className="border-border/50 h-full">
              <CardContent className="p-4 h-full">
                <div className="flex md:flex-col items-center md:items-center gap-4 md:gap-3 md:text-center h-full">
                  <div className="relative shrink-0">
                    <CosmeticAvatar
                        avatarUrl={getAvatarUrl()}
                        initials={initials}
                        equippedCosmetics={equipped}
                        size="xl"
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
                        className="absolute bottom-0 left-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                        aria-label="Change profile photo"
                      >
                        <Camera className="h-3 w-3" />
                      </button>
                      </>
                    )}
                  </div>
                  <div className="md:w-full">
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
                    <div className="flex gap-2 w-fit justify-center md:justify-start mb-4">
                      <Badge variant="secondary">
                        {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                      </Badge>
                      {isManager && <Badge variant="default">Manager</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug mb-8">
                      {Object.keys(equipped).length === 0
                        ? "No cosmetics equipped"
                        : Object.entries(equipped)
                            .map(([_slot, id]) => {
                              const item = COSMETICS.find((c) => c.id === id);
                              return item ? item.name : null;
                            })
                            .filter(Boolean)
                            .join("  ·  ")}
                    </p>

                    
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
          </div>

          {/* Owned cosmetics */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-muted-foreground text-center">Loading...</p>
            ) : ownedItems.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-muted-foreground">You don't own any cosmetics yet.</p>
                <Button onClick={() => (onVisitShop ? onVisitShop() : navigate("/shop"))}>
                  Visit the Shop
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Tabs value={category} onValueChange={(value) => setCategory(value as typeof category)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="hats" className="flex-1">
                      Hats
                    </TabsTrigger>
                    <TabsTrigger value="decorations" className="flex-1">
                      Decorations
                    </TabsTrigger>
                    <TabsTrigger value="themes" className="flex-1">
                      Themes
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {category === "hats"
                  ? renderSection(hats, "You don't own any hats yet.")
                  : category === "decorations"
                  ? renderSection(decorations, "You don't own any decorations yet.")
                  : renderSection(themes, "You don't own any themes yet.")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
