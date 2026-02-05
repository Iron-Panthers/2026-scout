import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";

interface StartMatchOverlayProps {
  /** Whether the overlay is visible */
  show: boolean;
  /** Callback when the user starts the match */
  onStartMatch: () => void;
  /** Match number */
  matchNumber?: number;
  /** Role */
  role?: string;
}

export default function StartMatchOverlay({
  show,
  onStartMatch,
  matchNumber,
  role,
}: StartMatchOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3">
      <div className="bg-card border-2 border-primary rounded-xl shadow-2xl p-4 sm:p-6 max-w-sm w-full text-center space-y-3 sm:space-y-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Play className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1 sm:space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Ready to Scout
          </h2>
          {matchNumber && (
            <p className="text-base sm:text-lg text-muted-foreground">
              Match #{matchNumber}
            </p>
          )}
          {role && (
            <p className="text-xs sm:text-sm text-muted-foreground">
              Role: {role}
            </p>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="text-xs sm:text-sm font-semibold text-foreground">
            Wait for the match to begin
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Press the button below as soon as the match starts. The timer will
            run continuously through all phases.
          </p>
        </div>

        {/* Start Button */}
        <Button
          onClick={onStartMatch}
          size="lg"
          className="w-full h-11 sm:h-12 text-base sm:text-lg font-semibold"
        >
          <Play className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
          Start Match
        </Button>

        {/* Disclaimer */}
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          If you start too early, use the reset option in the top-right menu
        </p>
      </div>
    </div>
  );
}
