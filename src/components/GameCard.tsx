import { useEffect, useId, useState } from "react";
import { Lock, Play, CheckCircle } from "lucide-react";
import type { GameDefinition } from "@/types";

interface GameCardProps {
  game: GameDefinition;
  isUnlocked: boolean;
  userPoints: number;
  isPlayable: boolean;
  onBuy: () => void;
  onPlay: () => void;
  /** Set right after this game is bought: plays the unlock animation once it shows as unlocked. */
  playUnlockAnimation?: boolean;
}

// Unlock animation timing: the latch lifts and pivots open, then the thumbnail fades in.
// LATCH_MS matches the game-lock-shackle-open animation in index.css.
const LATCH_MS = 750;
const REVEAL_MS = 450;

type UnlockPhase = "idle" | "latch" | "reveal";

/**
 * Lucide's lock, drawn by hand so the shackle can move on its own. The shackle's
 * left leg runs down into the body (clipped at the body's top edge), so when the
 * shackle lifts, only the right leg shows a gap; the shackle then pivots around
 * the left leg to the open position.
 */
function AnimatedLock({ opening }: { opening: boolean }) {
  // useId can contain ":" or "«»", which break url(#…) references.
  const clipId = `game-lock-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-8 h-8 text-foreground/70 overflow-visible"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          {/* Everything above the body's top edge (and wide enough for the open shackle). */}
          <rect x="-24" y="-24" width="72" height="35" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d="M7 16V7a5 5 0 0 1 10 0v4" className={opening ? "game-lock-shackle-open" : undefined} />
      </g>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    </svg>
  );
}

export function GameCard({ game, isUnlocked, userPoints, isPlayable, onBuy, onPlay, playUnlockAnimation = false }: GameCardProps) {
  const canAfford = userPoints >= game.cost;
  const [phase, setPhase] = useState<UnlockPhase>("idle");

  useEffect(() => {
    if (!playUnlockAnimation || !isUnlocked) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("latch");
    const toReveal = setTimeout(() => setPhase("reveal"), LATCH_MS);
    const toIdle = setTimeout(() => setPhase("idle"), LATCH_MS + REVEAL_MS);
    return () => {
      clearTimeout(toReveal);
      clearTimeout(toIdle);
    };
  }, [playUnlockAnimation, isUnlocked]);

  const animating = phase !== "idle";
  // Stay dimmed while the latch opens, then fade up to full.
  const dimmed = !isUnlocked || phase === "latch";

  function handleClick() {
    if (animating) return;
    if (isUnlocked && isPlayable) {
      onPlay();
    } else {
      onBuy();
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative flex aspect-square w-full flex-col rounded-lg border border-border bg-card overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-accent/30 active:scale-95"
      aria-label={isUnlocked ? `Play ${game.name}` : `Buy ${game.name} for ${game.cost} points`}
    >
      {/* Thumbnail */}
      <div className="relative min-h-0 flex-1 w-full bg-muted flex items-center justify-center overflow-hidden">
        {game.thumbnailUrl && (
          <img
            src={game.thumbnailUrl}
            alt={game.name}
            className={`absolute inset-0 w-full h-full ${game.thumbnailFit === "contain" ? "object-contain p-3" : "object-cover"}`}
            style={{ opacity: dimmed ? 0.45 : 1, transition: `opacity ${REVEAL_MS}ms ease-out` }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}

        {/* Lock overlay for locked games, kept through the unlock animation */}
        {(!isUnlocked || animating) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background/30"
            style={{ opacity: phase === "reveal" ? 0 : 1, transition: `opacity ${REVEAL_MS}ms ease-out` }}
          >
            {animating ? <AnimatedLock opening /> : <Lock className="w-8 h-8 text-foreground/70" />}
          </div>
        )}

        {/* Play overlay for unlocked games on hover */}
        {isUnlocked && isPlayable && !animating && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-background/40 transition-opacity">
            <Play className="w-8 h-8 text-foreground fill-foreground" />
          </div>
        )}
      </div>

      {/* Info row */}
      <div
        className="flex items-center justify-between px-2 py-1.5 gap-1"
        style={{ opacity: dimmed ? 0.45 : 1, transition: `opacity ${REVEAL_MS}ms ease-out` }}
      >
        <span className="text-xs font-medium truncate">{game.name}</span>

        {isUnlocked ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
        ) : game.cost === 0 ? (
          <span className="text-xs text-muted-foreground shrink-0">Free</span>
        ) : (
          <span
            className={`text-xs font-medium shrink-0 ${canAfford ? "text-foreground" : "text-muted-foreground"}`}
          >
            {game.cost} pts
          </span>
        )}
      </div>
    </button>
  );
}
