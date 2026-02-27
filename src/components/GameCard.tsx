import { Lock, Play, CheckCircle } from "lucide-react";
import type { GameDefinition } from "@/types";

interface GameCardProps {
  game: GameDefinition;
  isUnlocked: boolean;
  userPoints: number;
  onBuy: () => void;
  onPlay: () => void;
}

export function GameCard({ game, isUnlocked, userPoints, onBuy, onPlay }: GameCardProps) {
  const canAfford = userPoints >= game.cost;

  function handleClick() {
    if (isUnlocked) {
      onPlay();
    } else {
      onBuy();
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative flex flex-col w-full rounded-lg border border-border bg-card overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-accent/30 active:scale-95"
      style={{ opacity: isUnlocked ? 1 : 0.45 }}
      aria-label={isUnlocked ? `Play ${game.name}` : `Buy ${game.name} for ${game.cost} points`}
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-muted flex items-center justify-center overflow-hidden">
        {game.thumbnailUrl && (
          <img
            src={game.thumbnailUrl}
            alt={game.name}
            className="w-10 h-10 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {/* Lock overlay for locked games */}
        {!isUnlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/30">
            <Lock className="w-8 h-8 text-foreground/70" />
          </div>
        )}

        {/* Play overlay for unlocked games on hover */}
        {isUnlocked && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 bg-background/40 transition-opacity">
            <Play className="w-8 h-8 text-foreground fill-foreground" />
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="flex items-center justify-between px-2 py-1.5 gap-1">
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
