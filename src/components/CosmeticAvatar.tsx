import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COSMETICS } from "@/config/cosmetics";
import { cn } from "@/lib/utils";

interface CosmeticAvatarProps {
  avatarUrl?: string | null;
  initials?: string;
  equippedCosmetics?: Record<string, string>; // slot -> cosmetic id
  /** Size variant — controls the outer wrapper and emoji scale */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeConfig = {
  sm: { wrapperClass: "size-8", emojiHat: "text-sm", emojiPlant: "text-xs", hatOffset: "-top-2.5", plantOffset: "-bottom-1.5 -right-1.5" },
  md: { wrapperClass: "size-10", emojiHat: "text-base", emojiPlant: "text-sm", hatOffset: "-top-3", plantOffset: "-bottom-2 -right-2" },
  lg: { wrapperClass: "size-16", emojiHat: "text-2xl", emojiPlant: "text-lg", hatOffset: "-top-5", plantOffset: "-bottom-2 -right-2" },
};

export default function CosmeticAvatar({
  avatarUrl,
  initials = "?",
  equippedCosmetics = {},
  size = "md",
  className,
}: CosmeticAvatarProps) {
  const cfg = sizeConfig[size];

  const hatId = equippedCosmetics["hat"];
  const plantId = equippedCosmetics["plant"];
  const hatEmoji = hatId ? COSMETICS.find((c) => c.id === hatId)?.emoji : null;
  const plantEmoji = plantId ? COSMETICS.find((c) => c.id === plantId)?.emoji : null;

  return (
    <div className={cn("relative inline-flex shrink-0", cfg.wrapperClass, className)}>
      <Avatar className="size-full">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
      </Avatar>

      {hatEmoji && (
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 leading-none select-none pointer-events-none",
            cfg.emojiHat,
            cfg.hatOffset
          )}
          aria-hidden
        >
          {hatEmoji}
        </span>
      )}

      {plantEmoji && (
        <span
          className={cn(
            "absolute leading-none select-none pointer-events-none",
            cfg.emojiPlant,
            cfg.plantOffset
          )}
          aria-hidden
        >
          {plantEmoji}
        </span>
      )}
    </div>
  );
}
