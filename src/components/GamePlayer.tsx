import { ChevronLeft, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { GameDefinition } from "@/types";
import { FrcdleGame } from "@/components/FrcdleGame";

interface GamePlayerProps {
  game: GameDefinition | null;
  onClose: () => void;
  /** Pre-built navigation URL for the Start Match button. Omit if match isn't configured yet. */
  startUrl?: string | null;
  /** Called when Start Match is clicked but the match isn't configured yet. */
  onStartWithoutConfig?: () => void;
}

export function GamePlayer({ game, onClose, startUrl, onStartWithoutConfig }: GamePlayerProps) {
  const navigate = useNavigate();

  if (!game) return null;

  // FRCdle is also playable from the Shop, which has no match to start.
  const showStartMatch = game.id !== "frcdle" || Boolean(startUrl || onStartWithoutConfig);

  function handleStartMatch() {
    if (startUrl) {
      navigate(startUrl);
    } else if (onStartWithoutConfig) {
      onStartWithoutConfig();
    } else {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 bg-background z-[9999] flex flex-col"
      role="dialog"
      aria-label={`Playing ${game.name}`}
    >
      {/* Top bar — always above the iframe, never overlapping game controls */}
      <div className="relative flex items-center justify-between px-3 py-2 border-b border-border bg-background shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          aria-label="Close game and go back"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium text-muted-foreground">{game.name}</span>

        {showStartMatch && (
          <button
            onClick={handleStartMatch}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label={startUrl ? "Start scouting match" : "Configure match in Settings first"}
            title={startUrl ? undefined : "Set up a match in Settings first"}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Start Match
          </button>
        )}
      </div>

      {game.id === "frcdle" ? (
        <FrcdleGame />
      ) : (
        <iframe
          src={game.iframeUrl}
          title={game.name}
          className="w-full flex-1 border-none"
          allow="fullscreen; autoplay"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
        />
      )}
    </div>
  );
}
