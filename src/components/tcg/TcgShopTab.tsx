import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useDevMode } from "@/contexts/DevModeContext";
import { unlockAchievement } from "@/lib/achievements";
import { getBinder, getTcgPacks, openTcgPack, setCodeFor, TCG_RARITIES, type PulledCard, type TcgCard, type TcgPack } from "@/lib/tcg";
import { PackOpening, TcgPackArt } from "./PackOpening";
import mttd26Cover from "@/assets/tcg/mttd26-cover.png";

type Pack = TcgPack & { cards: TcgCard[] };

/** The achievement for collecting every card in a set. */
const SET_ACHIEVEMENTS: Record<string, string> = { mttd26: "mad_collector" };

/** Packs with their own cover artwork (others use the photo of their rarest card). */
const PACK_ART: Record<string, string> = { mttd26: mttd26Cover };

/** The pack's cover: the photo of its rarest card that has one. */
const coverOf = (pack: Pack) =>
  [...pack.cards].filter((card) => card.image_url).sort((a, b) => TCG_RARITIES.indexOf(b.rarity) - TCG_RARITIES.indexOf(a.rarity))[0];

/** The Shop's TCG tab: card packs to open, and how much of each set the user has. */
export function TcgShopTab({ userId, points, onPointsChange }: { userId: string; points: number; onPointsChange: (points: number) => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [opening, setOpening] = useState<string | null>(null);
  const [pulled, setPulled] = useState<{ pack: Pack; cards: PulledCard[] } | null>(null);
  // Dev mode opens packs into the sandbox's binder, with its points
  const { devMode } = useDevMode();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTcgPacks(), getBinder(userId, devMode)]).then(([list, binder]) => {
      if (cancelled) return;
      setPacks(list);
      setCounts(binder);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, devMode]);

  // Completing a set's achievement (once every card in it has been pulled)
  useEffect(() => {
    for (const pack of packs ?? []) {
      const achievement = SET_ACHIEVEMENTS[pack.id];
      if (achievement && pack.cards.length > 0 && pack.cards.every((card) => counts.has(card.id))) {
        void unlockAchievement(userId, achievement);
      }
    }
  }, [packs, counts, userId]);

  const open = async (pack: Pack) => {
    setOpening(pack.id);
    try {
      const result = await openTcgPack(pack, userId);
      onPointsChange(result.points);
      setPulled({ pack, cards: result.pulled });
      setCounts((current) => {
        const next = new Map(current);
        for (const pull of result.pulled) next.set(pull.card.id, (next.get(pull.card.id) ?? 0) + 1);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
      toast({ title: "Couldn't open the pack", description: message || "Try again.", variant: "destructive" });
    } finally {
      setOpening(null);
    }
  };

  if (!packs) {
    return <p className="py-10 text-center text-muted-foreground">Loading packs...</p>;
  }
  if (packs.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No card packs yet. Check back soon!</p>;
  }

  return (
    <div className="space-y-4">
      {packs.map((pack) => {
        const collected = pack.cards.filter((card) => counts.has(card.id)).length;
        const affordable = points >= pack.cost;
        return (
          <Card key={pack.id} className="border-border/50">
            <CardContent className="flex flex-col items-center gap-5 p-4 sm:flex-row sm:items-start">
              <TcgPackArt name={pack.name} cardsPerPack={pack.cards_per_pack} cover={coverOf(pack)} art={PACK_ART[pack.id]} width={140} />
              <div className="w-full min-w-0 flex-1 space-y-3">
                <p className="text-lg font-bold">{pack.name}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Collected</span>
                    <span className="tabular-nums">
                      {collected}/{pack.cards.length}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(collected / Math.max(1, pack.cards.length)) * 100}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="gap-1.5"
                    onClick={() => open(pack)}
                    disabled={!!opening || !affordable}
                    title={affordable ? undefined : `You need ${pack.cost} pts`}
                  >
                    {opening === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                    Open for {pack.cost} pts
                  </Button>
                  <Button variant="outline" className="gap-1.5" onClick={() => navigate("/profile?view=binder")}>
                    <BookOpen className="h-4 w-4" />
                    Card binder
                  </Button>
                </div>
                {devMode && <p className="text-xs text-muted-foreground">Dev mode: cards go to the sandbox's binder, not your account.</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {pulled && (
        <PackOpening
          packName={pulled.pack.name}
          cardsPerPack={pulled.pack.cards_per_pack}
          cover={coverOf(pulled.pack)}
          art={PACK_ART[pulled.pack.id]}
          setSize={pulled.pack.cards.length}
          setCode={setCodeFor(pulled.pack.id)}
          pulled={pulled.cards}
          onClose={() => setPulled(null)}
        />
      )}
    </div>
  );
}
