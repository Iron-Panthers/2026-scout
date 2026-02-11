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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2">
      <div className="bg-card border-2 border-primary rounded-xl shadow-2xl p-3 sm:p-4 max-w-xs w-full text-center space-y-2 sm:space-y-3">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Play className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-0.5 sm:space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            Ready to Scout
          </h2>
          {matchNumber && (
            <p className="text-sm sm:text-base text-muted-foreground">
              Match #{matchNumber}
            </p>
          )}
          {role && (
            <p className="text-xs text-muted-foreground">Role: {role}</p>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-2 sm:p-2.5 space-y-0.5 sm:space-y-1">
          <p className="text-xs font-semibold text-foreground">
            Wait for the match to begin
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Press the button below as soon as the match starts. The timer will
            run continuously through all phases.
          </p>
        </div>

        {/* Start Button */}
        <Button
          onClick={onStartMatch}
          size="lg"
          className="w-full h-10 sm:h-11 text-sm sm:text-base font-semibold"
        >
          <Play className="mr-2 h-4 w-4" />
          Start Match
        </Button>

        {/* Disclaimer */}
        <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
          If you start too early, use the reset option in the top-right menu
        </p>
      </div>
    </div>
  );
}
