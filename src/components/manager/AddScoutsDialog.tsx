import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserRound } from "lucide-react";
import { updateEvent } from "@/lib/matches";
import type { Event, Profile } from "@/types";
import CosmeticAvatar from "../CosmeticAvatar";

interface AddScoutsDialogProps {
  open: boolean;
  event?: Event;
  onOpenChange: (open: boolean) => void;
  allScouts: Profile[];
  availableScouts: Profile[];
  cosmeticsMap?: Record<string, Record<string, string>>;
  onSave: (users: string[]) => void;
}

export function AddScoutsDialog({
  open,
  event,
  onOpenChange,
  allScouts,
  availableScouts,
  cosmeticsMap = {},
  onSave,
}: AddScoutsDialogProps) {
  const [possibleOptions, setPossibleOptions] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const assignedIds = new Set(availableScouts.map((scout) => scout.id));
    setPossibleOptions(allScouts.filter((scout) => !assignedIds.has(scout.id)));
    setSelectedIds(new Set());
  }, [allScouts, availableScouts, open]);

  const toggleScout = (scoutId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(scoutId)) next.delete(scoutId);
      else next.add(scoutId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!event || selectedIds.size === 0) return;

    setLoading(true);
    const userIds = [...new Set([...(event.users || []), ...selectedIds])];
    const success = await updateEvent(event.id, { users: userIds });
    if (success) {
      onSave(userIds);
      setSelectedIds(new Set());
      onOpenChange(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Scouters to {event?.name}</DialogTitle>
          <DialogDescription>
            Select one or more scouters to add to this event.
          </DialogDescription>
        </DialogHeader>

        {possibleOptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <UserRound className="h-8 w-8" />
            <p>All available scouters are already assigned.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
            {possibleOptions.map((scout) => {
              const initials = (scout.name || "U")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              const selected = selectedIds.has(scout.id);

              return (
                <label
                  key={scout.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50"
                  }`}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleScout(scout.id)}
                    disabled={loading}
                    aria-label={`Select ${scout.name || "scouter"}`}
                  />
                  <CosmeticAvatar
                    initials={initials}
                    avatarUrl={scout.avatar_url}
                    equippedCosmetics={cosmeticsMap[scout.id]}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{scout.name || "Unknown"}</p>
                    <p className="text-sm capitalize text-muted-foreground">
                      {scout.role}{scout.is_manager ? " • Manager" : ""}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || selectedIds.size === 0 || !event}>
            {loading ? "Assigning..." : `Assign${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
