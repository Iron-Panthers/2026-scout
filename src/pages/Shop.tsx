import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, ShoppingBag, CheckCircle2, Package, ChevronLeft, ChevronRight, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { getGameProfile } from "@/lib/gameProfiles";
import { purchaseCosmetic, openCrate } from "@/lib/shopService";
import { purchaseGame } from "@/lib/gameProfiles";
import { getActiveEvent, isEventWithinWindow } from "@/lib/matches";
import { COSMETICS, RARITY_CONFIG, RARITY_VALUE, type CosmeticDefinition, type CosmeticCategory, type CrateRarity } from "@/config/cosmetics";
import { CRATE_TIERS, type CrateTier } from "@/config/crates";
import { GAMES } from "@/config/games";
import { getEventCurrencyLogo } from "@/config/eventCurrency";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { GameCard } from "@/components/GameCard";
import { GamePlayer } from "@/components/GamePlayer";
import { CrateOpeningAnimation } from "@/components/CrateOpeningAnimation";
import { useToast } from "@/hooks/use-toast";
import { useRandomSubtitle } from "@/hooks/useRandomSubtitle";
import { SHOP_SUBTITLES } from "@/config/headerSubtitles";
import type { GameProfile, GameDefinition, Event } from "@/types";

// ---------------------------------------------------------------------------
// Cosmetic card
// ---------------------------------------------------------------------------
interface CosmeticCardProps {
  item: CosmeticDefinition;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  /** Name of the event this item belongs to (for event-currency items). */
  eventName?: string;
  /** event_code of the event this item belongs to, used to resolve its currency logo. */
  eventCode?: string | null;
  onBuy: () => void;
}

function CosmeticCard({ item, owned, equipped, canAfford, eventName, eventCode, onBuy }: CosmeticCardProps) {
  return (
    <Card
      className={`relative overflow-hidden transition-all border pt-0 ${
        canAfford || owned ? "" : "opacity-70"
      }`}
      style={
        {
          borderColor: RARITY_CONFIG[item.rarity].color,
          backgroundColor: `${RARITY_CONFIG[item.rarity].color}0D`,
          // boxShadow: `0 0 6px 0px ${item.rarity !== 'common' && item.rarity !== 'uncommon' ? RARITY_CONFIG[item.rarity].color : 'transparent'}`
        }
      }
    >
      {equipped && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Equipped
          </Badge>
        </div>
      )}

      <CardContent className="h-50 p-4 flex flex-col pb-0">
        {item.currency === "event" && eventName && (
          <div className="-mx-4 -mt-4 flex shrink-0 items-center justify-center gap-1 border-b border-sky-500/30 bg-sky-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
            {eventName}
          </div>
        )}
        <div className="min-h-0 flex-1 flex flex-col items-center justify-center gap-3">
          {/* Big emoji preview */}
          {item.emoji && (
            <div className="text-5xl leading-none select-none">{item.emoji}</div>
          )}
          {item.url && (
            <img className="w-10 leading-none select-none" src={item.url} />
          )}

          <div className="text-center space-y-0.5 w-full">
            <p className="font-semibold text-sm text-foreground" style={{ color: RARITY_CONFIG[item.rarity].color }}>{item.name}</p>
            <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
          </div>
        </div>

          {owned ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="w-full text-xs border-green-600/40 text-green-400 mt-auto disabled:opacity-100"
            >
              Owned
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full text-xs gap-1"
              disabled={!canAfford || item.cost === 0}
              onClick={onBuy}
              style={{ backgroundColor: RARITY_CONFIG[item.rarity].bgColor }}
            >
              {item.currency === "event" ? (
                <img src={getEventCurrencyLogo(eventCode)} alt="ChezCoins" className="h-4 w-4" />
              ) : (
                <Coins className="h-3 w-3" />
              )}
              {item.cost === 0
                ? "Crate Exclusive"
                : item.currency === "event"
                ? item.cost
                : `${item.cost} pts`}
            </Button>
          )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Shop page
// ---------------------------------------------------------------------------
export default function Shop({
  embedded = false,
  headerActions = null,
}: { embedded?: boolean; headerActions?: HTMLElement | null } = {}) {
  const navigate = useNavigate();
  const { user, profile, getAvatarUrl } = useAuth();
  const { toast } = useToast();
  const subtitle = useRandomSubtitle(SHOP_SUBTITLES);

  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);
  const [buyTarget, setBuyTarget] = useState<CosmeticDefinition | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyGameTarget, setBuyGameTarget] = useState<GameDefinition | null>(null);
  const [buyingGame, setBuyingGame] = useState(false);
  const [playingGame, setPlayingGame] = useState<GameDefinition | null>(null);
  const [crateOpen, setCrateOpen] = useState(false);
  const [crateTierIndex, setCrateTierIndex] = useState(0);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    const gp = await getGameProfile(user.id);
    setGameProfile(gp);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    getActiveEvent().then(setActiveEvent);
  }, []);

  const owned = gameProfile?.owned_cosmetics ?? [];
  const equipped = gameProfile?.equipped_cosmetics ?? {};
  const points = gameProfile?.points ?? 0;
  const eventPoints = gameProfile?.event_points ?? 0;
  const eventCosmeticSources = gameProfile?.event_cosmetic_sources ?? {};
  const showEventTab = !!activeEvent && isEventWithinWindow(activeEvent);

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

  async function handleBuy() {
    if (!buyTarget || !user?.id) return;
    const currency = buyTarget.currency === "event" ? "event" : "points";
    setBuying(true);
    const result = await purchaseCosmetic(
      user.id,
      buyTarget.id,
      buyTarget.cost,
      currency,
      currency === "event" ? activeEvent?.name : undefined
    );
    setBuying(false);
    if (result.success) {
      const unit = currency === "event" ? "ChezCoins" : "pts";
      toast({ title: `Purchased ${buyTarget.name}!`, description: `You have ${result.newPoints} ${unit} remaining.` });
      setBuyTarget(null);
      loadProfile();
    } else {
      toast({ title: "Purchase failed", description: result.error, variant: "destructive" });
    }
  }

  async function handleBuyGame() {
    if (!buyGameTarget || !user?.id) return;
    setBuyingGame(true);
    const result = await purchaseGame(user.id, buyGameTarget.id, buyGameTarget.cost);
    setBuyingGame(false);
    if (result.success) {
      toast({ title: `Unlocked ${buyGameTarget.name}!`, description: `You have ${result.newPoints} pts remaining.` });
      setBuyGameTarget(null);
      loadProfile();
    } else {
      toast({ title: "Purchase failed", description: result.error, variant: "destructive" });
    }
  }

  async function handleCrateOpen(itemId: string) {
    if (!user?.id) return { success: false, newPoints: points, isDuplicate: false, refund: 0 };
    const result = await openCrate(user.id, itemId, CRATE_TIERS[crateTierIndex].cost);
    return result;
  }

  function handleCrateClose(newPoints?: number) {
    setCrateOpen(false);
    if (newPoints !== undefined) {
      setGameProfile((prev) => (prev ? { ...prev, points: newPoints } : prev));
    }
    loadProfile();
  }

  const rarityCompare = (a: CosmeticDefinition, b: CosmeticDefinition) =>
    a.rarity === b.rarity ? a.cost - b.cost : RARITY_VALUE[a.rarity] - RARITY_VALUE[b.rarity];

  const themes = COSMETICS.filter((c) => c.category === "theme" && c.currency !== "event").sort(rarityCompare);
  const eventItems = COSMETICS.filter((c) => c.currency === "event").sort(rarityCompare);

  function renderGrid(items: CosmeticDefinition[], currency: "points" | "event" = "points") {
    const balance = currency === "event" ? eventPoints : points;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map((item) => (
          <CosmeticCard
            key={item.id}
            item={item}
            owned={owned.includes(item.id) || !!item.default}
            equipped={equipped[item.category] === item.id}
            canAfford={balance >= item.cost}
            eventName={
              item.currency === "event"
                ? eventCosmeticSources[item.id] ?? activeEvent?.name
                : undefined
            }
            eventCode={activeEvent?.event_code}
            onBuy={() => setBuyTarget(item)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={embedded ? undefined : "min-h-screen bg-background"}>
      <div className="max-w-xl mx-auto md:max-w-none px-4 py-6 space-y-5">
        {/* Header */}
        {!embedded && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="gap-2 px-2" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-6 w-6 text-primary" />
                <div>
                  <span className="text-2xl font-bold block">Shop</span>
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className="gap-1.5 text-yellow-400 border-yellow-500/40 bg-yellow-500/10 text-sm font-semibold"
            >
              <Coins className="h-3.5 w-3.5" />
              {loading ? "—" : points.toLocaleString()} pts
            </Badge>
          </div>
        )}
        {embedded &&
          headerActions &&
          createPortal(
            <Badge
              variant="outline"
              className="gap-1.5 text-yellow-400 border-yellow-500/40 bg-yellow-500/10 text-sm font-semibold"
            >
              <Coins className="h-3.5 w-3.5" />
              {loading ? "—" : points.toLocaleString()} pts
            </Badge>,
            headerActions
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

          {/* Tabs */}
          <div className="flex-1 min-w-0">
            <Tabs defaultValue="themes">
              <TabsList className="w-full">
                <TabsTrigger value="themes" className="flex-1 gap-1.5">
                  Themes
                </TabsTrigger>
                <TabsTrigger value="crates" className="flex-1 gap-1.5">
                  Crates
                </TabsTrigger>
                <TabsTrigger value="games" className="flex-1 gap-1.5">
                  Games
                </TabsTrigger>
                {showEventTab && (
                  <TabsTrigger value="event" className="flex-1 gap-1.5">
                    Event
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value="themes" className="mt-4">
                {renderGrid(themes)}
              </TabsContent>
              <TabsContent value="crates" className="mt-4">
                <CratesTab
                  points={points}
                  ownedCosmetics={owned}
                  tier={CRATE_TIERS[crateTierIndex]}
                  onPrevTier={() => setCrateTierIndex((i) => (i - 1 + CRATE_TIERS.length) % CRATE_TIERS.length)}
                  onNextTier={() => setCrateTierIndex((i) => (i + 1) % CRATE_TIERS.length)}
                  onOpenCrate={() => setCrateOpen(true)}
                />
              </TabsContent>
              <TabsContent value="games" className="mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {GAMES.map((game) => {
                    const isUnlocked = (gameProfile?.unlocked_games ?? []).includes(game.id) || game.cost === 0;
                    return (
                      <GameCard
                        key={game.id}
                        game={game}
                        isUnlocked={isUnlocked}
                        userPoints={points}
                        isPlayable={false}
                        onBuy={() => setBuyGameTarget(game)}
                        onPlay={() => setPlayingGame(game)}
                      />
                    );
                  })}
                </div>
              </TabsContent>
              {showEventTab && activeEvent && (
                <TabsContent value="event" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-accent/30 px-4 py-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Live Event</p>
                      <p className="font-semibold">{activeEvent.name}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="gap-1.5 text-sky-400 border-sky-500/40 bg-sky-500/10 text-sm font-semibold"
                    >
                      <img src={getEventCurrencyLogo(activeEvent.event_code)} alt="ChezCoins" className="h-5 w-5" />
                      {loading ? "—" : eventPoints.toLocaleString()}
                    </Badge>
                  </div>
                  {renderGrid(eventItems, "event")}
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </div>

      {/* Buy confirmation dialog */}
      <Dialog open={!!buyTarget} onOpenChange={(open) => !open && setBuyTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="text-3xl leading-none">{buyTarget?.emoji}</span>
              {buyTarget?.name}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {buyTarget?.description}
            </DialogDescription>
          </DialogHeader>

          {buyTarget?.category === "theme" && buyTarget.themeValue && (
            <div data-theme={buyTarget.themeValue} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-background p-4 flex flex-col items-center gap-3">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Preview</span>
                <span className="px-4 py-2 rounded-md text-sm font-semibold bg-primary text-primary-foreground">
                  Sample Button
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3 my-1">
            <span className="text-sm text-muted-foreground">Cost</span>
            <span className="flex items-center gap-1.5 font-semibold text-yellow-400">
              {buyTarget?.currency === "event" ? (
                <img src={getEventCurrencyLogo(activeEvent?.event_code)} alt="ChezCoins" className="h-6 w-6" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              {buyTarget?.cost} {buyTarget?.currency !== "event" && "pts"}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <span className="text-sm text-muted-foreground">Your balance</span>
            <span
              className={`flex items-center gap-1.5 font-semibold ${
                buyTarget && (buyTarget.currency === "event" ? eventPoints : points) >= buyTarget.cost
                  ? "text-foreground"
                  : "text-red-400"
              }`}
            >
              {buyTarget?.currency === "event" && (
                <img src={getEventCurrencyLogo(activeEvent?.event_code)} alt="ChezCoins" className="h-4 w-4" />
              )}
              {buyTarget?.currency === "event" ? eventPoints : points} {buyTarget?.currency !== "event" && "pts"}
            </span>
          </div>

          <DialogFooter className="flex-row gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBuyTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold"
              disabled={
                buying ||
                !buyTarget ||
                (buyTarget.currency === "event" ? eventPoints : points) < buyTarget.cost
              }
              onClick={handleBuy}
            >
              {buying ? "Buying…" : "Buy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Game buy dialog */}
      <Dialog open={!!buyGameTarget} onOpenChange={(open) => !open && setBuyGameTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{buyGameTarget?.name}</DialogTitle>
            <DialogDescription className="text-sm">{buyGameTarget?.description}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3 my-1">
            <span className="text-sm text-muted-foreground">Cost</span>
            <span className="flex items-center gap-1.5 font-semibold text-yellow-400">
              <Coins className="h-4 w-4" />
              {buyGameTarget?.cost === 0 ? "Free" : `${buyGameTarget?.cost} pts`}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <span className="text-sm text-muted-foreground">Your balance</span>
            <span className={`font-semibold ${buyGameTarget && points >= buyGameTarget.cost ? "text-foreground" : "text-red-400"}`}>
              {points} pts
            </span>
          </div>

          <DialogFooter className="flex-row gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBuyGameTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold"
              disabled={buyingGame || !buyGameTarget || points < buyGameTarget.cost}
              onClick={handleBuyGame}
            >
              {buyingGame ? "Buying…" : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Game player overlay */}
      {playingGame && (
        <GamePlayer game={playingGame} onClose={() => setPlayingGame(null)} />
      )}

      {/* Crate opening animation */}
      <CrateOpeningAnimation
        isOpen={crateOpen}
        tier={CRATE_TIERS[crateTierIndex]}
        points={points}
        ownedCosmetics={owned}
        onOpen={handleCrateOpen}
        onClose={handleCrateClose}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crates tab content
// ---------------------------------------------------------------------------
interface CratesTabProps {
  points: number;
  ownedCosmetics: string[];
  tier: CrateTier;
  onPrevTier: () => void;
  onNextTier: () => void;
  onOpenCrate: () => void;
}

function CratesTab({ points, ownedCosmetics, tier, onPrevTier, onNextTier, onOpenCrate }: CratesTabProps) {
  const canAfford = points >= tier.cost;
  const tierIndex = CRATE_TIERS.findIndex((t) => t.id === tier.id);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const crateCategoryOrder: CosmeticCategory[] = ["hat", "decoration"];
  const cratePool = COSMETICS.filter(
    (c) => c.currency !== "event" && !c.default && c.category !== "theme"
  );

  const rarityCounts = (["common", "uncommon", "rare", "ultra-rare", "legendary"] as CrateRarity[]).map((r) => ({
    rarity: r,
    total: COSMETICS.filter((c) => c.rarity === r && c.currency !== "event" && !c.default && c.category !== "theme").length,
    owned: COSMETICS.filter(
      (c) => c.rarity === r && c.currency !== "event" && !c.default && c.category !== "theme" && ownedCosmetics.includes(c.id)
    ).length,
  }));

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto">
      {/* Crate tier switcher */}
      <div className="flex items-center justify-center gap-3 w-full">
        <button
          onClick={onPrevTier}
          aria-label="Previous crate"
          className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-1.5">
          <span className="font-semibold text-sm">{tier.name}</span>
          <div className="flex items-center gap-1.5">
            {CRATE_TIERS.map((t, i) => (
              <div
                key={t.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === tierIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={onNextTier}
          aria-label="Next crate"
          className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Crate card */}
      <Card className="w-full border-border/50 overflow-hidden">
        <CardContent className="p-6 flex flex-col items-center gap-4">
          {/* Crate visual (static) */}
          <div
            style={{
              width: 130,
              height: 130,
              background: "linear-gradient(145deg, #c48940 0%, #8b5520 42%, #6a3e10 100%)",
              border: "5px solid #3b2008",
              borderRadius: 10,
              position: "relative",
              overflow: "hidden",
              filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.5))",
            }}
          >
            {/* Lid band */}
            <div style={{ position: "absolute", top: "28%", left: 0, right: 0, height: 4, background: "#2d1600" }} />
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="none">
              <line x1="0" y1="33%" x2="50%" y2="100%" stroke="#2d1600" strokeWidth="3" opacity="0.5" />
              <line x1="100%" y1="33%" x2="50%" y2="100%" stroke="#2d1600" strokeWidth="3" opacity="0.5" />
              <line x1="0" y1="0" x2="50%" y2="30%" stroke="#2d1600" strokeWidth="2.5" opacity="0.4" />
              <line x1="100%" y1="0" x2="50%" y2="30%" stroke="#2d1600" strokeWidth="2.5" opacity="0.4" />
            </svg>
            {[{ top: 6, left: 6 }, { top: 6, right: 6 }, { bottom: 6, left: 6 }, { bottom: 6, right: 6 }].map((pos, i) => (
              <div key={i} style={{
                position: "absolute", width: 12, height: 12, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #e2e2e2 0%, #888 100%)",
                border: "1.5px solid #555", boxShadow: "inset 0 1.5px 2.5px rgba(255,255,255,0.6)",
                ...pos,
              } as React.CSSProperties} />
            ))}
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", paddingTop: "20%", fontSize: 46, fontWeight: 900,
              color: "rgba(255,220,100,0.16)", userSelect: "none",
            }}>?</div>
          </div>

          <div className="text-center space-y-1">
            <p className="font-bold text-lg">{tier.name}</p>
            <p className="text-sm text-muted-foreground">{tier.description}</p>
          </div>

          {/* Rarity odds */}
          <div className="w-full rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1.5 text-xs">
            {rarityCounts.map(({ rarity, total, owned: ownedCount }) => (
              <div key={rarity} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: RARITY_CONFIG[rarity].color }} />
                <span className="flex-1 text-muted-foreground">{RARITY_CONFIG[rarity].label}</span>
                <span className="font-mono text-muted-foreground/70 text-[10px]">
                  {ownedCount}/{total}
                </span>
                <span className="font-mono font-semibold" style={{ color: RARITY_CONFIG[rarity].color }}>
                  {Math.round(tier.odds[rarity] * 100)}%
                </span>
              </div>
            ))}
          </div>

          {/* Cost + open button */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Cost per crate</span>
              <span className="flex items-center gap-1.5 font-semibold text-yellow-400">
                <Coins className="h-3.5 w-3.5" />
                {tier.cost} pts
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your balance</span>
              <span className={`font-semibold ${canAfford ? "text-foreground" : "text-red-400"}`}>
                {points.toLocaleString()} pts
              </span>
            </div>

            <Button
              className="w-full font-bold gap-2 h-11"
              style={
                canAfford
                  ? {
                      background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                      boxShadow: "0 0 16px rgba(217,119,6,0.35)",
                      color: "#fff",
                    }
                  : {}
              }
              disabled={!canAfford}
              onClick={onOpenCrate}
            >
              <Package className="h-4 w-4" />
              Open {tier.name}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCatalogOpen(true)}>
        <List className="h-3.5 w-3.5" />
        View All Cosmetics
      </Button>

      <p className="text-xs text-muted-foreground text-center px-4">
        Crates give random cosmetics from any rarity. Already-owned items are marked as such.
      </p>

      {/* Full crate cosmetic catalog */}
      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>All Crate Cosmetics</DialogTitle>
            <DialogDescription>
              Every cosmetic obtainable from crates — hats and decorations, unowned items first.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {crateCategoryOrder.map((category) => {
              const items = cratePool
                .filter((c) => c.category === category)
                .sort((a, b) => {
                  const aOwned = ownedCosmetics.includes(a.id);
                  const bOwned = ownedCosmetics.includes(b.id);
                  return aOwned === bOwned ? 0 : aOwned ? 1 : -1;
                });
              if (items.length === 0) return null;
              return (
                <div key={category} className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {category === "hat" ? "Hats" : "Decorations"}
                  </span>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const isOwned = ownedCosmetics.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5"
                        >
                          {item.emoji && <span className="text-lg leading-none">{item.emoji}</span>}
                          {item.url && <img src={item.url} alt={item.name} className="h-5 w-5 object-contain" />}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                          </div>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: RARITY_CONFIG[item.rarity].color }}
                          >
                            {RARITY_CONFIG[item.rarity].label}
                          </span>
                          {isOwned && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
