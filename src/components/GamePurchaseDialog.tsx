import { useState } from "react";
import { Coins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GameDefinition } from "@/types";

interface GamePurchaseDialogProps {
  game: GameDefinition | null;
  userPoints: number;
  onConfirm: (game: GameDefinition) => Promise<void>;
  onClose: () => void;
}

export function GamePurchaseDialog({
  game,
  userPoints,
  onConfirm,
  onClose,
}: GamePurchaseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAfford = game ? userPoints >= game.cost : false;

  async function handleConfirm() {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(game);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && !loading) {
      setError(null);
      onClose();
    }
  }

  return (
    <Dialog open={!!game} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Unlock {game?.name}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground">{game?.description}</p>

              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Cost</span>
                <div className="flex items-center gap-1 font-medium">
                  <Coins className="w-3.5 h-3.5 text-yellow-500" />
                  <span>{game?.cost} points</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Your balance</span>
                <div className="flex items-center gap-1 font-medium">
                  <Coins className="w-3.5 h-3.5 text-yellow-500" />
                  <span className={!canAfford ? "text-destructive" : ""}>{userPoints} points</span>
                </div>
              </div>

              {!canAfford && (
                <p className="text-xs text-destructive">
                  You need {game ? game.cost - userPoints : 0} more points to unlock this game.
                </p>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canAfford || loading}
          >
            {loading ? "Purchasing…" : canAfford ? "Confirm Purchase" : "Not Enough Points"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
