import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COSMETICS, type EmojiType } from "@/config/cosmetics";
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
  sm: { wrapperClass: "size-8", emojiHat: "text-sm", emojiDecoration: "text-xs", hatOffset: "-top-2.5", decorationOffset: "-bottom-1.5 -right-1.5" },
  md: { wrapperClass: "size-10", emojiHat: "text-base", emojiDecoration: "text-sm", hatOffset: "-top-3", decorationOffset: "-bottom-2 -right-2" },
  lg: { wrapperClass: "size-16", emojiHat: "text-2xl", emojiDecoration: "text-lg", hatOffset: "-top-5", decorationOffset: "-bottom-2 -right-2" },
};

/** Check if a string looks like a URL (starts with http:// or https://) */
function isImageUrl(str: string | null | undefined): boolean {
  if (!str) return false;
  return str.startsWith("http://") || str.startsWith("https://");
}

/** Render emoji — either as text or as an image if it's a URL */
function EmojiContent({ emoji, emojiType, className }: { emoji: string; emojiType?: EmojiType; className: string }) {
  if (emojiType === "image" || isImageUrl(emoji)) {
    return <img src={emoji} alt="" className={cn("object-contain", className)} />;
  }
  return <>{emoji}</>;
}

export default function CosmeticAvatar({
  avatarUrl,
  initials = "?",
  equippedCosmetics = {},
  size = "md",
  className,
}: CosmeticAvatarProps) {
  const cfg = sizeConfig[size];

  const hatId = equippedCosmetics["hat"];
  const decorationId = equippedCosmetics["decoration"];
  const hatCosmetic = hatId ? COSMETICS.find((c) => c.id === hatId) : null;
  const decorationCosmetic = decorationId ? COSMETICS.find((c) => c.id === decorationId) : null;
  const hatEmoji = hatCosmetic?.emoji ?? null;
  const decorationEmoji = decorationCosmetic?.emoji ?? null;
  const hatEmojiType = hatCosmetic?.emojiType;
  const decorationEmojiType = decorationCosmetic?.emojiType;

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
          <EmojiContent emoji={hatEmoji} emojiType={hatEmojiType} className={cfg.emojiHat} />
        </span>
      )}

      {decorationEmoji && (
        <span
          className={cn(
            "absolute leading-none select-none pointer-events-none",
            cfg.emojiDecoration,
            cfg.decorationOffset
          )}
          aria-hidden
        >
          <EmojiContent emoji={decorationEmoji} emojiType={decorationEmojiType} className={cfg.emojiDecoration} />
        </span>
      )}
    </div>
  );
}
