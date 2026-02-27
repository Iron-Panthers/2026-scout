import { ChevronLeft } from "lucide-react";
import type { GameDefinition } from "@/types";

interface GamePlayerProps {
  game: GameDefinition | null;
  onClose: () => void;
}

export function GamePlayer({ game, onClose }: GamePlayerProps) {
  if (!game) return null;

  return (
    <div
      className="fixed inset-0 bg-background z-[9999] flex flex-col"
      role="dialog"
      aria-label={`Playing ${game.name}`}
    >
      {/* Back button */}
      <button
        onClick={onClose}
        className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-background/80 border border-border px-3 py-1.5 text-sm font-medium shadow backdrop-blur-sm hover:bg-accent transition-colors"
        aria-label="Close game and go back"
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </button>

      {/* Game iframe */}
      <iframe
        src={game.iframeUrl}
        title={game.name}
        className="w-full h-full border-none"
        allow="fullscreen; autoplay"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    </div>
  );
}
