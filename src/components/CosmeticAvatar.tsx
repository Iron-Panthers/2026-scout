import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { COSMETICS } from "@/config/cosmetics";
import { cn } from "@/lib/utils";
import { getStaticFrame, isAnimatedImage } from "@/lib/staticFrame";

interface CosmeticAvatarProps {
  avatarUrl?: string | null;
  initials?: string;
  equippedCosmetics?: Record<string, string>; // slot -> cosmetic id
  /** Size variant — controls the outer wrapper and emoji scale */
  size?: "sm" | "md" | "lg";
  className?: string;
  /**
   * For grids with many avatars: GIF hats/decorations only animate while on
   * screen (a still frame otherwise), and the profile picture loads lazily as a plain <img>.
   */
  lowPower?: boolean;
}

const COSMETICS_BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));
const EMPTY_COSMETICS: Record<string, string> = {};

// One observer shared by every low-power avatar, rather than one each.
const visibilityListeners = new Map<Element, (visible: boolean) => void>();
let visibilityObserver: IntersectionObserver | null = null;

function observeVisibility(element: Element, onChange: (visible: boolean) => void): () => void {
  visibilityObserver ??= new IntersectionObserver(
    (entries) => entries.forEach((entry) => visibilityListeners.get(entry.target)?.(entry.isIntersecting)),
    { rootMargin: "100px" }
  );
  visibilityListeners.set(element, onChange);
  visibilityObserver.observe(element);
  return () => {
    visibilityListeners.delete(element);
    visibilityObserver?.unobserve(element);
  };
}

/** Whether the element is on (or near) screen; always true unless `enabled`. */
function useOnScreen(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [onScreen, setOnScreen] = useState(!enabled);
  useEffect(() => {
    if (!enabled || !ref.current) return;
    return observeVisibility(ref.current, setOnScreen);
  }, [enabled, ref]);
  return !enabled || onScreen;
}

/** The image to show for a cosmetic: the original, or a still frame for GIFs when `still`. */
function useCosmeticSrc(url: string | null | undefined, still: boolean): string | null {
  const animated = !!url && still && isAnimatedImage(url);
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    if (!animated || !url) return;
    let cancelled = false;
    getStaticFrame(url).then((result) => {
      // If the frame can't be read back, fall back to the animated original.
      if (!cancelled) setFrame(result ?? url);
    });
    return () => { cancelled = true; };
  }, [animated, url]);
  if (!url) return null;
  return animated ? frame : url;
}

/** A plain lazy-loading profile picture; the initials underneath show until it loads or if it fails. */
function LazyAvatarImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="absolute inset-0 aspect-square size-full rounded-full object-cover"
    />
  );
}

const sizeConfig = {
  sm: { wrapperClass: "size-8", emojiHat: "text-sm", emojiDecoration: "text-xs", hatOffset: "-top-2.5", decorationOffset: "-bottom-1.5 -right-1.5" },
  md: { wrapperClass: "size-10", emojiHat: "text-base", emojiDecoration: "text-sm", hatOffset: "-top-3", decorationOffset: "-bottom-2 -right-2" },
  lg: { wrapperClass: "size-16", emojiHat: "text-3xl", emojiDecoration: "text-lg", hatOffset: "-top-5", decorationOffset: "-bottom-2 -right-2" },
};

function CosmeticAvatar({
  avatarUrl,
  initials = "?",
  equippedCosmetics = EMPTY_COSMETICS,
  size = "md",
  className,
  lowPower = false,
}: CosmeticAvatarProps) {
  const cfg = sizeConfig[size];
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Low power: GIFs animate only while on screen, so off-screen rows cost nothing to repaint.
  const onScreen = useOnScreen(wrapperRef, lowPower);
  const still = lowPower && !onScreen;

  const hatId = equippedCosmetics["hat"];
  const decorationId = equippedCosmetics["decoration"];
  const hatEmoji = hatId ? COSMETICS_BY_ID.get(hatId)?.emoji : null;
  const hatURL = useCosmeticSrc(hatId ? COSMETICS_BY_ID.get(hatId)?.url : null, still);
  const decorationEmoji = decorationId ? COSMETICS_BY_ID.get(decorationId)?.emoji : null;
  const decorationURL = useCosmeticSrc(decorationId ? COSMETICS_BY_ID.get(decorationId)?.url : null, still);

  return (
    <div ref={wrapperRef} className={cn("relative inline-flex shrink-0", cfg.wrapperClass, className)}>
      <Avatar className="size-full">
        {lowPower ? (
          <>
            <span className="bg-muted flex size-full items-center justify-center rounded-full text-xs font-medium">{initials}</span>
            {avatarUrl && <LazyAvatarImage src={avatarUrl} />}
          </>
        ) : (
          <>
            {avatarUrl && <AvatarImage src={avatarUrl} />}
            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
          </>
        )}
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
      {hatURL && (
        <img
          className={cn(
            "absolute left-1/2 -translate-x-1/2 leading-none select-none pointer-events-none",
            cfg.emojiHat,
            cfg.hatOffset
          )}
          aria-hidden
          alt=""
          loading={lowPower ? "lazy" : undefined}
          decoding="async"
          src={hatURL}
        />
      )}

      {decorationEmoji && (
        <span
          className={cn(
            "absolute leading-none select-none pointer-events-none",
            decorationId.id === "decoration_six_seven" ? cfg.emojiDecoration : "text-2xl",
            cfg.decorationOffset
          )}
          aria-hidden
        >
          {decorationEmoji}
        </span>
      )}
      {decorationURL && (
        <img
          className={cn(
            "absolute leading-none select-none pointer-events-none w-7",
            cfg.emojiDecoration,
            cfg.decorationOffset
          )}
          aria-hidden
          alt=""
          loading={lowPower ? "lazy" : undefined}
          decoding="async"
          src={decorationURL}
        />
      )}
    </div>
  );
}

export default memo(CosmeticAvatar);
