import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TCG_RARITIES, TCG_RARITY_LABEL, type PulledCard, type TcgCard as Card } from "@/lib/tcg";
import { TcgCard } from "./TcgCard";

/**
 * A pack's wrapper: its name under its cover. `art` is drawn artwork, shown on a white panel;
 * without it, `cover` is a card whose photo fills the middle of the wrapper.
 */
export function TcgPackArt({ name, cardsPerPack, cover, art, width = 150 }: { name: string; cardsPerPack: number; cover?: Card; art?: string; width?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-[0.6em] shadow-xl"
      style={{ width, aspectRatio: "5 / 8", fontSize: width / 12 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-700 via-blue-900 to-slate-950" />
      {art ? (
        <div className="absolute inset-x-[9%] top-[15%] h-[55%] overflow-hidden rounded-[0.35em] bg-white p-[0.3em] shadow-inner ring-[0.12em] ring-yellow-300/80">
          <img src={art} alt="" className="h-full w-full object-contain" draggable={false} />
        </div>
      ) : (
        cover?.image_url && (
          <img src={cover.image_url} alt="" referrerPolicy="no-referrer" className="absolute inset-x-0 top-[18%] h-[52%] w-full object-cover opacity-80" />
        )
      )}
      <div className="tcg-holo absolute inset-0" aria-hidden />
      {/* Crimped ends */}
      <div className="absolute inset-x-0 top-0 h-[6%] bg-[repeating-linear-gradient(90deg,#cbd5e1_0_0.3em,#94a3b8_0.3em_0.6em)]" />
      <div className="absolute inset-x-0 bottom-0 h-[6%] bg-[repeating-linear-gradient(90deg,#cbd5e1_0_0.3em,#94a3b8_0.3em_0.6em)]" />
      <div className="absolute inset-x-0 top-[7%] px-[0.5em] text-center">
        <span className="block text-[0.6em] font-bold tracking-[0.15em] text-yellow-300">ScouTCG</span>
      </div>
      <div className="absolute inset-x-0 bottom-[8%] px-[0.5em] text-center text-white">
        <span className="block text-[0.95em] font-black leading-tight drop-shadow">{name}</span>
        <span className="mt-[0.2em] block text-[0.55em] font-semibold uppercase tracking-wide text-white/80">{cardsPerPack} cards</span>
      </div>
    </div>
  );
}

/** How long a card takes to fly off the screen (ms). */
const FLY_MS = 450;
/** The pack's top strip peeling off left to right, then the pack sliding down off the screen (ms). */
const PEEL_MS = 900;
const SLIDE_MS = 650;

/** Where the tear runs: a straight line this far down the pack (%). */
const TEAR_Y = 7;
/** The rest of the pack, below the tear. */
const PACK_BODY = `polygon(0 ${TEAR_Y}%, 100% ${TEAR_Y}%, 100% 100%, 0 100%)`;
/**
 * The peeled part is drawn as linked pieces from the tear outward, each turned a little more
 * than the last, so it bends in a curve; this is the whole curve's bend once it's torn all the
 * way (degrees).
 */
const PEEL_BEND = 110;
const PEEL_PIECES = 10;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const rarityIndex = (card: Card) => TCG_RARITIES.indexOf(card.rarity);

interface PackOpeningProps {
  packName: string;
  cardsPerPack: number;
  cover?: Card;
  art?: string;
  setSize: number;
  setCode: string;
  pulled: PulledCard[];
  onClose: () => void;
}

/**
 * Opening a pack: tap it to tear the top off and slide it away, uncovering the cards face up.
 * Each tap flies the top card off the screen to show the next (rarest last, as in a real
 * pack), then they're all shown together.
 */
export function PackOpening({ packName, cardsPerPack, cover, art, setSize, setCode, pulled, onClose }: PackOpeningProps) {
  // Stable sort keeps the pull order within a rarity
  const [cards] = useState(() => [...pulled].sort((a, b) => rarityIndex(a.card) - rarityIndex(b.card)));
  const [stage, setStage] = useState<"pack" | "tearing" | "sliding" | "reveal" | "summary">("pack");
  const [index, setIndex] = useState(0);
  // The top card flying up off the screen, uncovering the next one
  const [leaving, setLeaving] = useState(false);
  // Each card tilts its own small, random way as it flies off (4°–12°, either direction)
  const [tilt, setTilt] = useState(0);
  // How far along the top the tear has got (0–1)
  const [peel, setPeel] = useState(0);
  const peelFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (peelFrame.current !== null) cancelAnimationFrame(peelFrame.current);
  }, []);
  const current = cards[index];
  const hasNext = index + 1 < cards.length;

  // Peels the strip off a frame at a time, then slides the pack away
  const openPack = () => {
    setStage("tearing");
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / PEEL_MS);
      setPeel(easeInOut(t));
      if (t < 1) {
        peelFrame.current = requestAnimationFrame(frame);
        return;
      }
      peelFrame.current = null;
      setStage("sliding");
      window.setTimeout(() => setStage("reveal"), SLIDE_MS);
    };
    peelFrame.current = requestAnimationFrame(frame);
  };

  const advance = () => {
    if (leaving) return;
    setTilt((4 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1));
    setLeaving(true);
    window.setTimeout(() => {
      // The next card is already face up underneath
      if (hasNext) setIndex(index + 1);
      else setStage("summary");
      setLeaving(false);
    }, FLY_MS);
  };

  const cardWidth = Math.min(280, typeof window === "undefined" ? 280 : window.innerWidth - 64);
  // A little wider than the cards, so the pack covers them until it slides away
  const packWidth = Math.round(cardWidth * 1.06);
  const packShown = stage === "pack" || stage === "tearing" || stage === "sliding";
  const peelAt = `${(peel * 100).toFixed(2)}%`;

  /**
   * Piece `k` of the peeled strip (0 at the tear), turned upward about its joint with the
   * piece before, with the rest of the strip nested inside so the turns add up into a curve.
   */
  const renderPeel = (k: number): React.ReactNode => {
    if (k === PEEL_PIECES) return null;
    const right = peel * (1 - k / PEEL_PIECES) * 100;
    // A hair wider than its share, so no seam shows between pieces
    const left = Math.max(0, peel * (1 - (k + 1) / PEEL_PIECES) * 100 - 0.4);
    return (
      <div
        className="absolute inset-0"
        style={{ transformOrigin: `${right}% ${TEAR_Y}%`, transform: `rotate(${(PEEL_BEND * peel) / PEEL_PIECES}deg)` }}
      >
        <div className="absolute inset-0" style={{ clipPath: `polygon(${left}% 0, ${right}% 0, ${right}% ${TEAR_Y}%, ${left}% ${TEAR_Y}%)` }}>
          <TcgPackArt name={packName} cardsPerPack={cardsPerPack} cover={cover} art={art} width={packWidth} />
        </div>
        {renderPeel(k + 1)}
      </div>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-4 backdrop-blur-sm ${
        stage === "summary" ? "overflow-y-auto" : "overflow-hidden"
      }`}
      role="dialog"
      aria-label={`Opening ${packName}`}
    >

      {stage !== "summary" && current && (
        <>
          <button
            type="button"
            onClick={stage === "pack" ? openPack : stage === "reveal" ? advance : undefined}
            className={`relative ${stage === "pack" ? "transition-transform hover:scale-105 active:scale-95" : ""}`}
            aria-label={stage === "pack" ? "Open the pack" : "Next card"}
          >
            {/* The next card, face up underneath */}
            {hasNext && (
              <div className="absolute inset-0">
                <TcgCard card={cards[index + 1].card} setSize={setSize} setCode={setCode} width={cardWidth} />
              </div>
            )}
            {/* The top card; keyed by card, so each new one appears in place instead of animating in */}
            <div
              key={index}
              className="relative"
              style={{
                transition: `transform ${FLY_MS}ms cubic-bezier(0.5, 0, 0.75, 0)`,
                transform: leaving ? `translateY(-120vh) rotate(${tilt}deg)` : "none",
              }}
            >
              <TcgCard card={current.card} setSize={setSize} setCode={setCode} width={cardWidth} />
              {/* First copy: "New" on the card's top right (hidden under the pack until it's open) */}
              {current.isNew && stage === "reveal" && (
                <span className="absolute -right-2 -top-2">
                  <NewPill />
                </span>
              )}
            </div>

            {/* The pack over the cards: its top strip tears off, then it slides down out of the way */}
            {packShown && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div
                  style={{
                    clipPath: PACK_BODY,
                    transition: `transform ${SLIDE_MS}ms cubic-bezier(0.55, 0, 0.8, 0.2)`,
                    transform: stage === "sliding" ? "translateY(120vh)" : "none",
                  }}
                >
                  <TcgPackArt name={packName} cardsPerPack={cardsPerPack} cover={cover} art={art} width={packWidth} />
                </div>
                {/* The strip still attached, right of the tear */}
                {stage !== "sliding" && (
                  <div className="absolute inset-0" style={{ clipPath: `polygon(${peelAt} 0, 100% 0, 100% ${TEAR_Y}%, ${peelAt} ${TEAR_Y}%)` }}>
                    <TcgPackArt name={packName} cardsPerPack={cardsPerPack} cover={cover} art={art} width={packWidth} />
                  </div>
                )}
                {/* The part peeled so far, bending up and back from where the tear has reached
                    like a strip pulled by a finger; once it's all torn off it flies away */}
                {peel > 0 && (
                  <div
                    className="absolute inset-0"
                    style={{
                      transformOrigin: `${peelAt} ${TEAR_Y}%`,
                      transition: stage === "sliding" ? "transform 450ms ease-in, opacity 450ms ease-in" : "none",
                      transform: stage === "sliding" ? "translate(-5%, -80%) rotate(20deg)" : "none",
                      opacity: stage === "sliding" ? 0 : 1,
                    }}
                  >
                    {renderPeel(0)}
                  </div>
                )}
              </div>
            )}
          </button>
          <div className="flex h-8 items-center gap-2 text-white">
            {stage === "reveal" && !leaving && <span className="font-semibold">{TCG_RARITY_LABEL[current.card.rarity]}</span>}
          </div>
        </>
      )}

      {stage === "summary" && (
        <>
          <p className="flex items-center gap-2 text-lg font-bold text-white">
            <Sparkles className="h-5 w-5 text-yellow-300" />
            Your pulls
          </p>
          <div className="flex max-w-3xl flex-wrap justify-center gap-3">
            {cards.map((pull, i) => (
              <div key={i} className="relative">
                <TcgCard card={pull.card} setSize={setSize} setCode={setCode} width={140} />
                {pull.isNew && (
                  <span className="absolute -right-2 -top-2">
                    <NewPill />
                  </span>
                )}
              </div>
            ))}
          </div>
          <Button onClick={onClose}>Done</Button>
        </>
      )}
    </div>
  );
}

function NewPill() {
  return <span className="tcg-pop inline-block rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">New</span>;
}
