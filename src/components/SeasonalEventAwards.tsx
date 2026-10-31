import { useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COSMETICS, type CosmeticDefinition } from "@/config/cosmetics";
import {
  COSMETICS_GRANTED_EVENT,
  SEASONAL_ITEM_COLOR,
  activeSeasonalEvents,
  type SeasonalEvent,
} from "@/config/seasonalEvents";
import { grantCosmetics } from "@/lib/shopService";

const CATEGORY_LABEL: Record<CosmeticDefinition["category"], string> = { hat: "Hat", decoration: "Decoration", theme: "Theme" };
/** Time between one item's reveal and the next's, and how long a reveal takes. */
const REVEAL_STAGGER_MS = 900;
const REVEAL_MS = 700;
const SPARKS = 8;

/** One awarded item, popping in after `delay` ms. */
function RewardItem({ item, delay }: { item: CosmeticDefinition; delay: number }) {
  // The delay goes inside each animation (a separate animationDelay would be reset by the shorthand)
  const play = (animation: string, extra = 0) => `${animation} ${delay + extra}ms both`;
  return (
    <div className="flex w-36 flex-col items-center gap-2">
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Slowly turning rays and a burst of light behind the item */}
        <div
          className="absolute inset-0 rounded-full opacity-0"
          style={{
            background: `repeating-conic-gradient(${SEASONAL_ITEM_COLOR}55 0deg 12deg, transparent 12deg 30deg)`,
            maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
            animation: `${play("seasonal-reward-fade-up 300ms ease-out")}, seasonal-reward-rays 8s linear ${delay}ms infinite`,
          }}
        />
        <div
          className="absolute inset-4 rounded-full"
          style={{ background: `radial-gradient(circle, ${SEASONAL_ITEM_COLOR}aa, transparent 70%)`, animation: play("seasonal-reward-burst 900ms ease-out") }}
        />
        {Array.from({ length: SPARKS }, (_, index) => {
          const angle = (index / SPARKS) * Math.PI * 2;
          return (
            <span
              key={index}
              className="absolute h-1.5 w-1.5 rounded-full bg-orange-300"
              style={
                {
                  "--spark-x": `${Math.cos(angle) * 60}px`,
                  "--spark-y": `${Math.sin(angle) * 60}px`,
                  animation: play("seasonal-reward-spark 800ms ease-out", 150),
                } as CSSProperties
              }
            />
          );
        })}
        {/* The item itself */}
        <div className="relative" style={{ animation: play(`seasonal-reward-pop ${REVEAL_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.3)`) }}>
          {item.emoji && <div className="text-6xl leading-none select-none">{item.emoji}</div>}
          {item.url && <img src={item.url} alt="" className="h-16 w-16 rounded-lg object-cover shadow-lg select-none" />}
        </div>
      </div>
      <div className="text-center" style={{ animation: play("seasonal-reward-fade-up 400ms ease-out", REVEAL_MS / 2) }}>
        <p className="text-sm font-semibold">{item.name}</p>
        <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[item.category]}</p>
      </div>
    </div>
  );
}

/**
 * Awards the items of every seasonal event that's on to the signed-in user, once each,
 * when they open the app (and when they come back to it, in case an event started since).
 * The first time, an event with a `welcome` greets them in a popup, then reveals what they got.
 */
export default function SeasonalEventAwards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id;
  // The event being celebrated and the items it just awarded; revealing once they continue
  const [award, setAward] = useState<{ event: SeasonalEvent; items: CosmeticDefinition[] } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealDone, setRevealDone] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let running = false;
    const awardItems = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        for (const event of activeSeasonalEvents()) {
          const items = COSMETICS.filter((item) => item.seasonalEvent === event.id);
          if (items.length === 0) continue;
          const given = await grantCosmetics(userId, items.map((item) => item.id));
          if (given.length === 0) continue;
          const givenItems = items.filter((item) => given.includes(item.id));
          window.dispatchEvent(new Event(COSMETICS_GRANTED_EVENT));
          if (event.welcome) {
            setRevealing(false);
            setRevealDone(false);
            setAward({ event, items: givenItems });
          } else {
            toast({ title: `${event.name}!`, description: `You got ${givenItems.map((item) => item.name).join(", ")} for joining in.` });
          }
        }
      } finally {
        running = false;
      }
    };
    void awardItems();
    document.addEventListener("visibilitychange", awardItems);
    return () => document.removeEventListener("visibilitychange", awardItems);
  }, [userId, toast]);

  // The closing button shows once every item has popped in
  useEffect(() => {
    if (!revealing || !award) return;
    const timer = window.setTimeout(() => setRevealDone(true), (award.items.length - 1) * REVEAL_STAGGER_MS + REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, award]);

  if (!award?.event.welcome) return null;
  const { title, message } = award.event.welcome;

  return (
    <Dialog open onOpenChange={(open) => !open && setAward(null)}>
      <DialogContent className="seasonal-reward sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">{title}</DialogTitle>
          <DialogDescription className="text-center">
            {revealing ? `Your ${award.event.name} ${award.items.length === 1 ? "item" : "items"}:` : message}
          </DialogDescription>
        </DialogHeader>
        {revealing && (
          <div className="flex flex-wrap justify-center gap-4 py-2">
            {award.items.map((item, index) => (
              <RewardItem key={item.id} item={item} delay={index * REVEAL_STAGGER_MS} />
            ))}
          </div>
        )}
        <DialogFooter className="sm:justify-center">
          {!revealing ? (
            <Button className="w-full sm:w-40" onClick={() => setRevealing(true)}>
              Continue
            </Button>
          ) : (
            <Button
              className="w-full sm:w-40"
              style={{ animation: revealDone ? "seasonal-reward-fade-up 300ms ease-out both" : undefined }}
              disabled={!revealDone}
              onClick={() => setAward(null)}
            >
              Awesome!
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
