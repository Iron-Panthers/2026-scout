import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { getGameProfile } from "@/lib/gameProfiles";
import { equipCosmetic, unequipCosmetic } from "@/lib/shopService";
import { COSMETICS, RARITY_CONFIG, RARITY_VALUE, type CosmeticDefinition } from "@/config/cosmetics";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { useToast } from "@/hooks/use-toast";
import { useRandomSubtitle } from "@/hooks/useRandomSubtitle";
import { AVATAR_SUBTITLES } from "@/config/headerSubtitles";
import type { GameProfile } from "@/types";

export default function AvatarPage({
  embedded = false,
  onVisitShop,
}: { embedded?: boolean; onVisitShop?: () => void } = {}) {
  const navigate = useNavigate();
  const { user, profile, getAvatarUrl } = useAuth();
  const { toast } = useToast();
  const { updateSetting } = useSettings();
  const subtitle = useRandomSubtitle(AVATAR_SUBTITLES);

  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      updateSetting("theme", item.themeValue);
    }
    const result = await equipCosmetic(user.id, item.category, item.id);
    if (result.success) {
      toast({ title: `${item.name} equipped!` });
    } else {
      toast({ title: "Failed to equip", description: result.error, variant: "destructive" });
      loadProfile();
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

  const rarityCompare = (a: CosmeticDefinition, b: CosmeticDefinition) =>
    a.rarity === b.rarity ? a.cost - b.cost : RARITY_VALUE[a.rarity] - RARITY_VALUE[b.rarity];

  const ownedItems = COSMETICS.filter((c) => owned.includes(c.id) || c.default);
  const hats = ownedItems.filter((c) => c.category === "hat").sort(rarityCompare);
  const decorations = ownedItems.filter((c) => c.category === "decoration").sort(rarityCompare);
  const themes = ownedItems.filter((c) => c.category === "theme").sort(rarityCompare);

  function renderSection(title: string, items: CosmeticDefinition[]) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((item) => {
            const isEquipped = equipped[item.category] === item.id;
            const eventSource = eventCosmeticSources[item.id];
            return (
              <Card
                key={item.id}
                className="relative overflow-hidden border pt-0"
                style={{
                  borderColor: RARITY_CONFIG[item.rarity].color,
                  backgroundColor: `${RARITY_CONFIG[item.rarity].color}0D`,
                }}
              >
                {isEquipped && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Equipped
                    </Badge>
                  </div>
                )}
                <CardContent className="h-50 p-4 flex flex-col pb-0">
                  {eventSource && (
                    <div className="-mx-4 -mt-4 flex shrink-0 items-center justify-center gap-1 border-b border-sky-500/30 bg-sky-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
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
      <div className="max-w-xl mx-auto md:max-w-none px-4 py-6 space-y-5">
        {!embedded && (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-2 px-2" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <div>
                <span className="text-2xl font-bold block">My Cosmetics</span>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main layout: stacked on mobile, sidebar+content on md+ */}
        <div className="flex flex-col md:flex-row gap-5 justify-center">
          {/* Avatar sidebar */}
          <div className="w-full md:w-56 md:shrink-0 md:sticky md:top-6">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <div className="flex md:flex-col items-center md:items-center gap-4 md:gap-3 md:text-center">
                  <CosmeticAvatar
                    avatarUrl={getAvatarUrl()}
                    initials={initials}
                    equippedCosmetics={equipped}
                    size="lg"
                  />
                  <div className="md:w-full">
                    <p className="font-medium">{userName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
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
              <div className="space-y-6">
                {renderSection("Hats", hats)}
                {renderSection("Decorations", decorations)}
                {renderSection("Themes", themes)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
