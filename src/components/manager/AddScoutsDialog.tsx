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
import { Input } from "@/components/ui/input";
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
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const assignedIds = new Set(availableScouts.map((scout) => scout.id));
    setPossibleOptions(allScouts.filter((scout) => !assignedIds.has(scout.id)));
    setSelectedIds(new Set());
    setSearchQuery("");
  }, [allScouts, availableScouts, open]);

  const filteredOptions = possibleOptions.filter((scout) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return `${scout.name || ""} ${scout.role}`.toLowerCase().includes(query);
  });

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
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Assign Scouters to {event?.name}</DialogTitle>
          <DialogDescription>
            Select one or more scouters to add to this event.
          </DialogDescription>
        </DialogHeader>

        {possibleOptions.length > 0 && (
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search scouters..."
            aria-label="Search scouters"
            className="mb-3 shrink-0"
          />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {possibleOptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <UserRound className="h-8 w-8" />
              <p>All available scouters are already assigned.</p>
            </div>
          ) : filteredOptions.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              No scouters match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
              {filteredOptions.map((scout) => {
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
                        {scout.role}{scout.is_manager ? " • Manager" : ""}{scout.is_developer ? " • Developer" : ""}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background pt-4">
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
