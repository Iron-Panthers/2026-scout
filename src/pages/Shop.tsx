import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, ShoppingBag, CheckCircle2, Sparkles } from "lucide-react";
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
import { purchaseCosmetic, equipCosmetic, unequipCosmetic } from "@/lib/shopService";
import { purchaseGame } from "@/lib/gameProfiles";
import { COSMETICS, type CosmeticDefinition } from "@/config/cosmetics";
import { GAMES } from "@/config/games";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import { GameCard } from "@/components/GameCard";
import { GamePlayer } from "@/components/GamePlayer";
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

  const hats = COSMETICS.filter((c) => c.category === "hat");
  const decorations = COSMETICS.filter((c) => c.category === "decoration");

  function renderGrid(items: CosmeticDefinition[]) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
    <div className="min-h-screen bg-background my-15">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
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

        {/* Avatar preview */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <CosmeticAvatar
                avatarUrl={getAvatarUrl()}
                initials={initials}
                equippedCosmetics={equipped}
                size="lg"
              />
              <div>
                <p className="font-medium">{userName}</p>
                <p className="text-sm text-muted-foreground">
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

        {/* Tabs */}
        <Tabs defaultValue="hats">
          <TabsList className="w-full">
            <TabsTrigger value="hats" className="flex-1 gap-1.5">
              Hats
            </TabsTrigger>
            <TabsTrigger value="decorations" className="flex-1 gap-1.5">
              Decorations
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
          <TabsContent value="games" className="mt-4">
            <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}
