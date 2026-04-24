import { memo, useMemo } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogPortal,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import CosmeticAvatar from "@/components/CosmeticAvatar";
import type { Profile } from "@/types";
import { Badge } from "@/components/ui/badge";

// Instant dialog content without animations
function InstantDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-black/50"
      />
      <DialogPrimitive.Content
        className={cn(
          "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg outline-none sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

interface ScoutAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableScouts: Profile[];
  onAssignScout: (profile: Profile) => void;
  cosmeticsMap?: Record<string, Record<string, string>>;
}

// Memoized scout item to prevent re-renders
const ScoutItem = memo(({ profile, onSelect, equippedCosmetics }: { profile: Profile; onSelect: () => void; equippedCosmetics?: Record<string, string> }) => {
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
      <div className="relative">
        <CosmeticAvatar
          avatarUrl={profile.avatar_url || ""}
          initials={initials}
          equippedCosmetics={equippedCosmetics ?? {}}
          size="md"
        />
        {profile.clocked_in && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{profile.name || "Unknown"}</p>
          {profile.clocked_in && (
            <Badge className="h-4 px-1.5 text-[10px] bg-green-600/20 text-green-400 border border-green-600/30 font-medium">
              Active
            </Badge>
          )}
        </div>
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
  cosmeticsMap = {},
}: ScoutAssignmentDialogProps) {
  // Sort clocked-in scouts to the top
  const sortedScouts = useMemo(
    () => [...availableScouts].sort((a, b) => (b.clocked_in ? 1 : 0) - (a.clocked_in ? 1 : 0)),
    [availableScouts]
  );

  const clockedInCount = sortedScouts.filter((s) => s.clocked_in).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <InstantDialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Assign Scout
            {clockedInCount > 0 && (
              <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs font-medium">
                {clockedInCount} active
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Search scouts..." />
          <CommandList>
            <CommandEmpty>No scouts found.</CommandEmpty>
            <CommandGroup>
              {sortedScouts.map((profile) => (
                <ScoutItem
                  key={profile.id}
                  profile={profile}
                  onSelect={() => onAssignScout(profile)}
                  equippedCosmetics={cosmeticsMap[profile.id]}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </InstantDialogContent>
    </Dialog>
  );
}
