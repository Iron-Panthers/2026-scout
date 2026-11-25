import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDevMode } from "@/contexts/DevModeContext";
import { getAllTcgCards, getBinder, getTcgPackNames, setCodeFor, TCG_RARITIES, type TcgCard as Card } from "@/lib/tcg";
import { TcgCard } from "./TcgCard";

/** Every TCG card a user has pulled, set by set, with a count pill on duplicates. */
export function CardBinder({ userId, isOwn }: { userId: string; isOwn: boolean }) {
  const [loaded, setLoaded] = useState<{ for: string; cards: Card[]; counts: Map<string, number>; packNames: Record<string, string> } | null>(null);
  const [zoomed, setZoomed] = useState<Card | null>(null);
  // In dev mode your own binder is the sandbox's (other people's are still their real ones)
  const { devMode } = useDevMode();
  const sandbox = devMode && isOwn;
  const loadKey = `${userId}:${sandbox}`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAllTcgCards(), getBinder(userId, sandbox), getTcgPackNames()]).then(([cards, counts, packNames]) => {
      if (!cancelled) setLoaded({ for: `${userId}:${sandbox}`, cards, counts, packNames });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, sandbox]);

  // Each set's cards, and how many are in it (for "12/34")
  const sets = useMemo(() => {
    if (!loaded) return [];
    const byPack = new Map<string, Card[]>();
    for (const card of loaded.cards) byPack.set(card.pack_id, [...(byPack.get(card.pack_id) ?? []), card]);
    return [...byPack.entries()].map(([packId, cards]) => ({
      packId,
      size: cards.length,
      // Every card in the set, Common through Legendary, then by number within a rarity
      cards: [...cards].sort((a, b) => TCG_RARITIES.indexOf(a.rarity) - TCG_RARITIES.indexOf(b.rarity) || a.number - b.number),
      collected: cards.filter((card) => loaded.counts.has(card.id)).length,
    }));
  }, [loaded]);

  if (!loaded || loaded.for !== loadKey) {
    return <p className="py-10 text-center text-muted-foreground">Loading cards...</p>;
  }
  if (sets.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">No card sets yet.</p>;
  }

  const setSizeOf = (card: Card) => sets.find((set) => set.packId === card.pack_id)?.size ?? 0;

  return (
    <div className="space-y-6">
      {sandbox && <p className="text-xs text-muted-foreground">Dev mode: these are the sandbox's cards, not your account's.</p>}
      {sets.map((set) => (
          <section key={set.packId} className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">{loaded.packNames[set.packId] ?? setCodeFor(set.packId)}</h3>
              <span className="text-sm tabular-nums text-muted-foreground">
                {set.collected}/{set.size} collected
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
              {set.cards.map((card) => {
                const count = loaded.counts.get(card.id) ?? 0;
                // Not pulled yet: a hollow frame in its place, with just its number
                if (count === 0) {
                  return (
                    <div
                      key={card.id}
                      className="flex items-center justify-center rounded-[0.9em] border-2 border-dashed border-muted-foreground/30 bg-muted/20"
                      style={{ width: 150, aspectRatio: "63 / 88", fontSize: 150 / 20 }}
                      aria-label={`Card ${card.number} of ${set.size}, not collected`}
                    >
                      <span className="text-[1.1em] font-bold tabular-nums text-muted-foreground/50">
                        {String(card.number).padStart(3, "0")}
                      </span>
                    </div>
                  );
                }
                return (
                  <button key={card.id} type="button" className="relative transition-transform hover:-translate-y-1" onClick={() => setZoomed(card)}>
                    <TcgCard card={card} setSize={set.size} setCode={setCodeFor(set.packId)} width={150} />
                    {count > 1 && (
                      <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-bold tabular-nums text-primary-foreground shadow-md ring-2 ring-background">
                        x{count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      <Dialog open={!!zoomed} onOpenChange={(open) => !open && setZoomed(null)}>
        {/* No close button: tapping outside the card (or Escape) closes it */}
        <DialogContent showCloseButton={false} className="w-auto max-w-none border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{zoomed?.team_name}</DialogTitle>
          {zoomed && (
            <TcgCard
              card={zoomed}
              setSize={setSizeOf(zoomed)}
              setCode={setCodeFor(zoomed.pack_id)}
              width={Math.min(320, typeof window === "undefined" ? 320 : window.innerWidth - 48)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
