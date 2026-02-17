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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Profile } from "@/types";

// Instant dialog content without animations
function InstantDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/50",
          className
        )}
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
      <InstantDialogContent className="sm:max-w-[425px]">
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
      </InstantDialogContent>
    </Dialog>
  );
}
