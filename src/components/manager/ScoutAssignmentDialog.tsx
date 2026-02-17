import { memo, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile } from "@/types";

interface ScoutAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableScouts: Profile[];
  onAssignScout: (profile: Profile) => void;
}

// Memoized scout item to prevent re-renders
const ScoutItem = memo(({ profile, onSelect }: { profile: Profile; onSelect: () => void }) => {
  const initials = useMemo(() =>
    (profile.name || "U")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
    [profile.name]
  );

  return (
    <CommandItem
      key={profile.id}
      onSelect={onSelect}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="text-sm bg-primary/20 text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <p className="font-medium">{profile.name || "Unknown"}</p>
        <p className="text-sm text-muted-foreground">
          {profile.role}
        </p>
      </div>
    </CommandItem>
  );
});

ScoutItem.displayName = "ScoutItem";

export function ScoutAssignmentDialog({
  open,
  onOpenChange,
  availableScouts,
  onAssignScout,
}: ScoutAssignmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Scout</DialogTitle>
        </DialogHeader>
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Search scouts..." />
          <CommandList>
            <CommandEmpty>No scouts found.</CommandEmpty>
            <CommandGroup>
              {availableScouts.map((profile) => (
                <ScoutItem
                  key={profile.id}
                  profile={profile}
                  onSelect={() => onAssignScout(profile)}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
