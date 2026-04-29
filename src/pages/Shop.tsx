import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, ShoppingBag, CheckCircle2, Sparkles, Package } from "lucide-react";
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
import { purchaseCosmetic, equipCosmetic, unequipCosmetic, openCrate, CRATE_COST } from "@/lib/shopService";
import { purchaseGame } from "@/lib/gameProfiles";
import { COSMETICS, RARITY_CONFIG, type CosmeticDefinition, type CrateRarity } from "@/config/cosmetics";
import { GAMES } from "@/config/games";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { GameCard } from "@/components/GameCard";
import { GamePlayer } from "@/components/GamePlayer";
import { CrateOpeningAnimation } from "@/components/CrateOpeningAnimation";
import { useToast } from "@/hooks/use-toast";
import type { GameProfile, GameDefinition } from "@/types";

// ---------------------------------------------------------------------------
// Cosmetic card
// ---------------------------------------------------------------------------
interface CosmeticCardProps {
  item: CosmeticDefinition;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
}

function CosmeticCard({ item, owned, equipped, canAfford, onBuy, onEquip, onUnequip }: CosmeticCardProps) {
  return (
    <Card
      className={`relative overflow-hidden transition-all border ${
        equipped
          ? "border-yellow-500/60 bg-yellow-500/5"
          : owned
          ? "border-green-600/40 bg-green-900/5"
          : canAfford
          ? "border-border hover:border-border/80 bg-card"
          : "border-border/40 bg-card/60 opacity-70"
      }`}
    >
      {equipped && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/40 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Equipped
          </Badge>
        </div>
      )}
      {!equipped && owned && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
            Owned
          </Badge>
        </div>
      )}

      <CardContent className="p-4 flex flex-col items-center gap-3">
        {/* Big emoji preview */}
        <div className="text-5xl leading-none mt-2 select-none">{item.emoji}</div>

        <div className="text-center space-y-0.5 w-full">
          <p className="font-semibold text-sm text-foreground">{item.name}</p>
          <p className="text-xs text-muted-foreground leading-snug">{item.description}</p>
        </div>

        {owned ? (
          equipped ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
              onClick={onUnequip}
            >
              Unequip
            </Button>
          ) : (
            <Button
              size="sm"
              className="w-full text-xs bg-green-700 hover:bg-green-600 text-white"
              onClick={onEquip}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Equip
            </Button>
          )
        ) : (
          <Button
            size="sm"
            className="w-full text-xs gap-1"
            disabled={!canAfford}
            onClick={onBuy}
          >
            <Coins className="h-3 w-3" />
            {item.cost} pts
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Shop page
// ---------------------------------------------------------------------------
export default function Shop() {
  const navigate = useNavigate();
  const { user, profile, getAvatarUrl } = useAuth();
  const { toast } = useToast();

  const [gameProfile, setGameProfile] = useState<GameProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [buyTarget, setBuyTarget] = useState<CosmeticDefinition | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyGameTarget, setBuyGameTarget] = useState<GameDefinition | null>(null);
  const [buyingGame, setBuyingGame] = useState(false);
  const [playingGame, setPlayingGame] = useState<GameDefinition | null>(null);
  const [crateOpen, setCrateOpen] = useState(false);

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
  const points = gameProfile?.points ?? 0;

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
    setBuying(true);
    const result = await purchaseCosmetic(user.id, buyTarget.id, buyTarget.cost);
    setBuying(false);
    if (result.success) {
      toast({ title: `Purchased ${buyTarget.name}!`, description: `You have ${result.newPoints} pts remaining.` });
      setBuyTarget(null);
      loadProfile();
    } else {
      toast({ title: "Purchase failed", description: result.error, variant: "destructive" });
    }
  }

  async function handleEquip(item: CosmeticDefinition) {
    if (!user?.id) return;
    const result = await equipCosmetic(user.id, item.category, item.id);
    if (result.success) {
      toast({ title: `${item.name} equipped!` });
      loadProfile();
    } else {
      toast({ title: "Failed to equip", description: result.error, variant: "destructive" });
    }
  }

  async function handleUnequip(item: CosmeticDefinition) {
    if (!user?.id) return;
    const result = await unequipCosmetic(user.id, item.category);
    if (result.success) {
      toast({ title: `${item.name} unequipped.` });
      loadProfile();
    } else {
      toast({ title: "Failed to unequip", description: result.error, variant: "destructive" });
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
    if (!user?.id) return { success: false, newPoints: points, isDuplicate: false };
    const result = await openCrate(user.id, itemId);
    return result;
  }

  function handleCrateClose(newPoints?: number) {
    setCrateOpen(false);
    if (newPoints !== undefined) {
      setGameProfile((prev) => (prev ? { ...prev, points: newPoints } : prev));
    }
    loadProfile();
  }

  const hats = COSMETICS.filter((c) => c.category === "hat");
  const decorations = COSMETICS.filter((c) => c.category === "decoration");

  function renderGrid(items: CosmeticDefinition[]) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {items.map((item) => (
          <CosmeticCard
            key={item.id}
            item={item}
            owned={owned.includes(item.id)}
            equipped={equipped[item.category] === item.id}
            canAfford={points >= item.cost}
            onBuy={() => setBuyTarget(item)}
            onEquip={() => handleEquip(item)}
            onUnequip={() => handleUnequip(item)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto md:max-w-none px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="gap-2 px-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-lg">Shop</span>
          </div>
          <Badge
            variant="outline"
            className="gap-1.5 text-yellow-400 border-yellow-500/40 bg-yellow-500/10 text-sm font-semibold"
          >
            <Coins className="h-3.5 w-3.5" />
            {loading ? "—" : points.toLocaleString()} pts
          </Badge>
        </div>

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
                              return item ? `${item.emoji} ${item.name}` : null;
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
            <Tabs defaultValue="hats">
              <TabsList className="w-full">
                <TabsTrigger value="hats" className="flex-1 gap-1.5">
                  Hats
                </TabsTrigger>
                <TabsTrigger value="decorations" className="flex-1 gap-1.5">
                  Decorations
                </TabsTrigger>
                <TabsTrigger value="crates" className="flex-1 gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Crates
                </TabsTrigger>
                <TabsTrigger value="games" className="flex-1 gap-1.5">
                  Games
                </TabsTrigger>
              </TabsList>
              <TabsContent value="hats" className="mt-4">
                {renderGrid(hats)}
              </TabsContent>
              <TabsContent value="decorations" className="mt-4">
                {renderGrid(decorations)}
              </TabsContent>
              <TabsContent value="crates" className="mt-4">
                <CratesTab
                  points={points}
                  ownedCosmetics={owned}
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

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3 my-1">
            <span className="text-sm text-muted-foreground">Cost</span>
            <span className="flex items-center gap-1.5 font-semibold text-yellow-400">
              <Coins className="h-4 w-4" />
              {buyTarget?.cost} pts
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
            <span className="text-sm text-muted-foreground">Your balance</span>
            <span className={`font-semibold ${buyTarget && points >= buyTarget.cost ? "text-foreground" : "text-red-400"}`}>
              {points} pts
            </span>
          </div>

          <DialogFooter className="flex-row gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setBuyTarget(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-black font-semibold"
              disabled={buying || !buyTarget || points < buyTarget.cost}
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
  onOpenCrate: () => void;
}

function CratesTab({ points, ownedCosmetics, onOpenCrate }: CratesTabProps) {
  const canAfford = points >= CRATE_COST;

  const rarityCounts = (["common", "uncommon", "rare", "ultra-rare", "legendary"] as CrateRarity[]).map((r) => ({
    rarity: r,
    total: COSMETICS.filter((c) => c.rarity === r).length,
    owned: COSMETICS.filter((c) => c.rarity === r && ownedCosmetics.includes(c.id)).length,
  }));

  return (
    <div className="flex flex-col items-center gap-5 max-w-sm mx-auto">
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
            <p className="font-bold text-lg">Mystery Crate</p>
            <p className="text-sm text-muted-foreground">
              A chance at exclusive cosmetics across all rarities!
            </p>
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
                  {rarity === "legendary" ? "1%" : rarity === "ultra-rare" ? "4%" : rarity === "rare" ? "15%" : rarity === "uncommon" ? "30%" : "50%"}
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
                {CRATE_COST} pts
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
              Open Mystery Crate
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center px-4">
        Crates give random cosmetics from any rarity. Already-owned items are marked as such.
      </p>
    </div>
  );
}
