import React, { useState, useEffect, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { gsap } from "gsap";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COSMETICS, RARITY_CONFIG, type CosmeticDefinition, type CosmeticCategory, type CrateRarity, isLimitedCosmetic } from "@/config/cosmetics";
import type { CrateTier } from "@/config/crates";

const CATEGORY_LABEL: Record<CosmeticCategory, string> = {
  hat: "Hat",
  decoration: "Decoration",
  theme: "Theme",
};

// ---------------------------------------------------------------------------
// Roll logic (client-side)
// ---------------------------------------------------------------------------
const RARITY_ORDER: CrateRarity[] = ["legendary", "ultra-rare", "rare", "uncommon", "common"];

export function rollCrate(
  odds: Record<CrateRarity, number>,
  ownedCosmetics: string[] = []
): { item: CosmeticDefinition; rarity: CrateRarity } {
  const rand = Math.random();
  let cumulative = 0;
  let selectedRarity: CrateRarity = "common";
  for (const rarity of RARITY_ORDER) {
    cumulative += odds[rarity];
    if (rand < cumulative) {
      selectedRarity = rarity;
      break;
    }
  }

  let pool = COSMETICS.filter(
    (c) => c.rarity === selectedRarity && !isLimitedCosmetic(c) && !c.default && c.category !== "theme"
  );

  // Legendaries never duplicate unless the player already owns every legendary.
  if (selectedRarity === "legendary") {
    const unowned = pool.filter((c) => !ownedCosmetics.includes(c.id));
    if (unowned.length > 0) pool = unowned;
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
  return { item, rarity: selectedRarity };
}

// ---------------------------------------------------------------------------
// Crate visual
// ---------------------------------------------------------------------------
const CRATE_SIZE = 160;
const LID_HEIGHT = 46; // px of the 160px crate
/** How deep the lid is front to back: its hinge sits this far behind the front face. */
const LID_DEPTH = 120;
/** Weak perspective, so the far (hinge) edge of the open lid barely narrows. */
const LID_PERSPECTIVE = 1600;
/**
 * Looks for each crate tier: all the same wooden crate, told apart by the clasp and key:
 * bronze (common), silver (uncommon) and gold (rare). `blocky`, `bevel` and `texture`
 * allow a tier its own style.
 */
interface CratePalette {
  /** Front faces of the base and lid */
  face: string;
  /** Outer border */
  border: string;
  /** Seam between lid and base, and the lid underside's border */
  seam: string;
  /** Sheen across the top of the lid (RGB) */
  sheen: string;
  /** Inside of the lid, seen once it's open */
  underside: string;
  /** Surface pattern laid over the faces (wood grain, metal plates, obsidian specks) */
  texture: string;
  /** Square corners instead of rounded ones */
  blocky: boolean;
  /** Inset bevel on the faces (light top-left, dark bottom-right); "" for none */
  bevel: string;
  /** The latch / lock plate (its metal also colours the key) */
  lock: { metal: Metal; face: string; border: string; keyhole: string; glow: string };
}

const WOOD_GRAIN =
  "repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(0,0,0,0.07) 26px, rgba(0,0,0,0.07) 28px)";

/** Clasp-and-key metals: each crate tier's clasp and the key that opens it share one. */
type Metal = "bronze" | "silver" | "gold";

const METALS: Record<Metal, { light: string; mid: string; dark: string; outline: string }> = {
  bronze: { light: "#f3c08a", mid: "#c47f3c", dark: "#7a4a1e", outline: "#5a3412" },
  silver: { light: "#f8fafc", mid: "#b6bcc6", dark: "#6b7280", outline: "#4b5563" },
  gold: { light: "#fff4c2", mid: "#e8b923", dark: "#9a6e08", outline: "#7a5a07" },
};

function metalLock(metal: Metal): CratePalette["lock"] {
  const { light, mid, dark, outline } = METALS[metal];
  return { metal, face: `linear-gradient(160deg, ${light} 0%, ${mid} 55%, ${dark} 100%)`, border: outline, keyhole: "#1c0d02", glow: "" };
}

const WOODEN_CRATE: Omit<CratePalette, "lock"> = {
  face: "linear-gradient(145deg, #c48940 0%, #8b5520 42%, #6a3e10 100%)",
  border: "#3b2008",
  seam: "#2d1600",
  sheen: "255,210,110",
  underside: "linear-gradient(180deg, #4a2a0c 0%, #5e3712 60%, #6f4216 100%)",
  texture: WOOD_GRAIN,
  blocky: false,
  bevel: "",
};

const CRATE_PALETTES: Record<CrateTier["id"], CratePalette> = {
  common: { ...WOODEN_CRATE, lock: metalLock("bronze") },
  uncommon: { ...WOODEN_CRATE, lock: metalLock("silver") },
  rare: { ...WOODEN_CRATE, lock: metalLock("gold") },
};

export interface CrateParts {
  lid?: React.Ref<HTMLDivElement>;
  lock?: React.Ref<HTMLDivElement>;
  key?: React.Ref<HTMLDivElement>;
  glow?: React.Ref<HTMLDivElement>;
  /** The won item, hidden inside the crate until it rises out. */
  prize?: { ref: React.Ref<HTMLDivElement>; content: React.ReactNode };
}

// Keyhole centre within the 160px crate; the key is clipped to the right of it so
// its bit disappears into the keyhole.
const KEYHOLE_X = CRATE_SIZE / 2;
const KEYHOLE_Y = LID_HEIGHT + 7.5;
const KEY_SHAFT_Y = 13.5; // shaft centre line in KeyGraphic
/** How far the key's tip ends up inside the keyhole. */
const KEY_INSERT_DEPTH = 16;
/** How far right of fully inserted the key sits when lined up with the keyhole, ready to push in. */
const KEY_LINEUP_OFFSET = 45;
/** The preview key floats in front of the crate: larger, with a wide soft shadow below it. */
const KEY_NEAR_SCALE = 1.8;
const KEY_NEAR_SHADOW = "drop-shadow(0px 22px 10px rgba(0,0,0,0.55))";
const KEY_LOCK_SHADOW = "drop-shadow(0px 2px 1px rgba(0,0,0,0.55))";
/** How far above the lock the key's flight curve is pulled (the key itself peaks only a few px above). */
const KEY_ARC_LIFT = 40;
/** The gold key (rare crate) grows from this to this as it swings across, coming closer. */
const GOLD_KEY_START_SCALE = 0.6;
const GOLD_KEY_NEAR_SCALE = 2.3;
/** Width of the overlay's content column (Tailwind max-w-sm), used to aim the gold key at the empty space beside it. */
const CONTENT_COLUMN_WIDTH = 384;
/** The silver key (uncommon crate) lies on the floor at this size, a little closer to the viewer than the crate. */
const SILVER_KEY_FLOOR_SCALE = 1.3;
/** How high the silver key's handle is lifted off the floor before it's carried to the lock (px). */
const SILVER_KEY_LIFT = 90;
/** How long the silver key hangs from its handle, swinging, before it's carried to the lock. */
const SILVER_KEY_DANGLE_MS = 200;
/** Its gentle swing while hanging: starting size (°), time for one full swing (s), and how fast it dies down (s). */
const SILVER_KEY_SWAY_DEGREES = 9;
const SILVER_KEY_SWAY_PERIOD = 0.85;
const SILVER_KEY_SWAY_DECAY = 0.9;
/** The key's handle (centre of its ring in KeyGraphic), as a transform origin: where it's held when picked up. */
const KEY_HANDLE_ORIGIN = "58px 13.5px";
/** Pause between the rare crate landing and its gold key swinging in. */
const GOLD_KEY_ENTRANCE_DELAY_MS = 500;
/** How long the gold key's swing in, and its flight from there to the lock, take. */
const GOLD_KEY_SWING_SECONDS = 0.9;
const GOLD_KEY_FLIGHT_SECONDS = 0.8;
/** How far right of the straight line the gold key's flight to the lock curves out (px). */
const GOLD_KEY_FLIGHT_BOW = 160;
/** The gold key's angle while it sparkles: tilted 45°, handle up and to the right. */
const GOLD_KEY_REST_ANGLE = -45;
/** How far through the swing (0–1 of its time) the sparkle starts: where the eased-out swing has all but stopped (~98% of the way). */
const GOLD_KEY_SPARKLE_AT = 0.65;
/** Where the gold key's sparkle appears, in the key drawing: the top-right edge of its ring. */
const KEY_SPARKLE_AT = { x: 65, y: 5 };
/** How long the key's arcing flight from the corner of the screen to the keyhole takes. */
const KEY_FLIGHT_SECONDS = 1.3;
/** Where the lined-up key sits, in crate coordinates. */
const KEY_LINEUP_LEFT = KEYHOLE_X - KEY_INSERT_DEPTH + KEY_LINEUP_OFFSET;
const KEY_LINEUP_TOP = KEYHOLE_Y - KEY_SHAFT_Y;

/** A key lying sideways, bit on the left so it slides left into the keyhole, in its crate's clasp metal. */
function KeyGraphic({ metal = "silver" }: { metal?: Metal }) {
  const { light, mid, dark, outline } = METALS[metal];
  const gradientId = `crate-key-${metal}`;
  return (
    <svg width="72" height="28" viewBox="0 0 72 28" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>
      {/* Bit teeth */}
      <path d="M2 14 V20 H6 V17 H10 V21 H14 V14 Z" fill={`url(#${gradientId})`} stroke={outline} strokeWidth="1" />
      {/* Shaft */}
      <rect x="1" y="11" width="46" height="5" rx="1.5" fill={`url(#${gradientId})`} stroke={outline} strokeWidth="1" />
      {/* Bow */}
      <circle cx="58" cy="13.5" r="11" fill={`url(#${gradientId})`} stroke={outline} strokeWidth="1.2" />
      <circle cx="60" cy="13.5" r="2.75" fill="#3b2008" />
    </svg>
  );
}

/**
 * The crate: a lid that can lift off, a lock plate with a keyhole on the front,
 * and (when `parts.key` is given) a key hidden off to the side, ready to slide in.
 */
export function CrateVisual({
  intensity = 0,
  size = CRATE_SIZE,
  tier = "common",
  parts = {},
}: {
  intensity?: number;
  size?: number;
  /** Which crate: sets its colour (common wood, uncommon green, rare blue). */
  tier?: CrateTier["id"];
  parts?: CrateParts;
}) {
  const palette = CRATE_PALETTES[tier] ?? CRATE_PALETTES.common;
  // Intensity 0 = resting shadow, 1-3 = warm gold glow (not rarity-revealing)
  const glowColor =
    intensity === 0
      ? undefined
      : intensity === 1
      ? "rgba(200,150,50,0.45)"
      : intensity === 2
      ? "rgba(220,165,60,0.65)"
      : "rgba(245,185,70,0.9)";

  return (
    <div style={{ width: size, height: size }}>
      <div
        style={{
          width: CRATE_SIZE,
          height: CRATE_SIZE,
          position: "relative",
          transform: size === CRATE_SIZE ? undefined : `scale(${size / CRATE_SIZE})`,
          transformOrigin: "top left",
          filter: glowColor
            ? `drop-shadow(0 0 14px ${glowColor}) drop-shadow(0 0 36px ${glowColor})`
            : "drop-shadow(0 8px 24px rgba(0,0,0,0.7))",
          transition: "filter 0.3s ease",
        }}
      >
        {/* Light from inside, shown once the lid comes off */}
        {parts.glow && (
          <div
            ref={parts.glow}
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              top: LID_HEIGHT - 50,
              height: 90,
              borderRadius: "50%",
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        )}

        {/* The prize waits behind the base's front, so rising reads as coming out of the crate */}
        {parts.prize && (
          <div
            ref={parts.prize.ref}
            style={{
              position: "absolute",
              left: CRATE_SIZE / 2 - 40,
              top: LID_HEIGHT + 6,
              width: 80,
              height: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {parts.prize.content}
          </div>
        )}

        {/* Base */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: LID_HEIGHT,
            bottom: 0,
            background: palette.face,
            border: `5px solid ${palette.border}`,
            borderTop: `4px solid ${palette.seam}`,
            borderRadius: palette.blocky ? 0 : "0 0 10px 10px",
            boxShadow: palette.bevel || undefined,
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: palette.texture }} />
        </div>

        {/* Lid: a 3D box with its front face (what you normally see) and its underside,
            which points into the crate until the lid swings open on its back hinge */}
        <div
          ref={parts.lid}
          style={{
            position: "absolute",
            left: -3,
            right: -3,
            top: 0,
            height: LID_HEIGHT,
            transformStyle: "preserve-3d",
            zIndex: 2,
          }}
        >
          {/* Front face */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: palette.face,
              border: `5px solid ${palette.border}`,
              borderRadius: palette.blocky ? 0 : "10px 10px 3px 3px",
              overflow: "hidden",
              boxShadow: [palette.bevel, "0 3px 4px rgba(0,0,0,0.45)"].filter(Boolean).join(", "),
              backfaceVisibility: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: palette.texture }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(180deg, rgba(${palette.sheen},0.28) 0%, rgba(${palette.sheen},0) 100%)`,
              }}
            />
          </div>
          {/* Underside: hangs back from the front face's bottom edge, edge-on until opened */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: LID_HEIGHT,
              height: LID_DEPTH,
              transformOrigin: "50% 0%",
              transform: "rotateX(-90deg)",
              background: palette.underside,
              border: `5px solid ${palette.seam}`,
              borderRadius: palette.blocky ? 0 : 3,
              boxShadow: "inset 0 0 14px rgba(0,0,0,0.6)",
              backfaceVisibility: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: palette.texture }} />
          </div>

          {/* Lock plate (hasp) with keyhole: fixed to the lid's front and hanging over the
              base, so it swings up with the lid */}
          <div
            ref={parts.lock}
            style={{
              position: "absolute",
              boxSizing: "border-box",
              left: KEYHOLE_X - 17 + 3, // the lid box starts 3px left of the crate
              top: LID_HEIGHT - 14,
              width: 34,
              height: 44,
              borderRadius: palette.blocky ? 2 : "6px 6px 10px 10px",
              background: palette.lock.face,
              border: `2px solid ${palette.lock.border}`,
              boxShadow: ["inset 0 1.5px 2px rgba(255,255,255,0.55)", "0 2px 4px rgba(0,0,0,0.5)", palette.lock.glow]
                .filter(Boolean)
                .join(", "),
              // Stays visible from behind too: once the lid swings past upright, the clasp
              // sticks up off its top edge with its back toward us
              transform: "translateZ(1px)",
            }}
          >
            {/* Keyhole */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: KEYHOLE_Y - (LID_HEIGHT - 14) - 2 - 4.5,
                width: 9,
                height: 9,
                marginLeft: -4.5,
                borderRadius: "50%",
                background: palette.lock.keyhole,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: KEYHOLE_Y - (LID_HEIGHT - 14) - 2 + 1.5,
                width: 0,
                height: 0,
                marginLeft: -4,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderBottom: `11px solid ${palette.lock.keyhole}`,
              }}
            />
          </div>
        </div>

        {/* Key: sits under the lock plate so its bit disappears into the keyhole */}
        {/* Key, in a window starting at the keyhole: whatever slides left of it is "inside" the lock */}
        {parts.key && (
          <div
            style={{
              position: "absolute",
              left: KEYHOLE_X,
              top: KEYHOLE_Y - KEY_SHAFT_Y,
              width: 140,
              height: 28,
              overflow: "hidden",
              zIndex: 5,
              pointerEvents: "none",
            }}
          >
            <div ref={parts.key} style={{ position: "absolute", left: -KEY_INSERT_DEPTH, top: 0, opacity: 0, filter: KEY_LOCK_SHADOW }}>
              <KeyGraphic metal={palette.lock.metal} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 30;

type Phase = "idle" | "unlocking" | "flash" | "item";

interface Props {
  isOpen: boolean;
  tier: CrateTier;
  points: number;
  ownedCosmetics: string[];
  onOpen: (
    itemId: string
  ) => Promise<{ success: boolean; newPoints: number; isDuplicate: boolean; refund: number }>;
  onClose: (newPoints?: number) => void;
}

export function CrateOpeningAnimation({ isOpen, tier, points, ownedCosmetics, onOpen, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [isOpening, setIsOpening] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [wonItem, setWonItem] = useState<CosmeticDefinition | null>(null);
  const [wonRarity, setWonRarity] = useState<CrateRarity>("common");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [refund, setRefund] = useState(0);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [shakeIntensity, setShakeIntensity] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const crateRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  // The key shown beside the crate on the preview screen (unclipped, unlike the one in the lock)
  const previewKeyRef = useRef<HTMLDivElement>(null);
  // Inner layer of the preview key: scale, tilt, bob and shadow (the outer layer carries its position)
  const previewKeyInnerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const idlePanelRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const itemCardRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        angle:
          (i / PARTICLE_COUNT) * 2 * Math.PI + (Math.random() - 0.5) * 0.5,
        distance: 90 + Math.random() * 170,
        size: 5 + Math.random() * 10,
        delay: Math.random() * 0.18,
        isSquare: Math.random() > 0.55,
      })),
    []
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setPhase("idle");
    setIsOpening(false);
    setCanClose(false);
    setWonItem(null);
    setWonRarity("common");
    setIsDuplicate(false);
    setRefund(0);
    setFinalPoints(null);
    setShakeIntensity(0);
  }, [isOpen]);

  // Idle float animation. Depends on isOpen too: the component is mounted closed (it
  // renders nothing), so on the very first open the phase is already "idle" and this
  // would otherwise never run, leaving the key unplaced and invisible until it reaches the lock.
  useEffect(() => {
    if (phase !== "idle" || !crateRef.current) return;
    const tween = gsap.to(crateRef.current, {
      y: -14,
      duration: 1.6,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    // The key waits just off the bottom of the screen (bottom-right), large and tilted as
    // if close to the viewer, until it flies up to the crate
    const keyEl = previewKeyRef.current;
    const keyInnerEl = previewKeyInnerRef.current;
    const placeKey = () => {
      if (keyEl) gsap.set(keyEl, { ...previewKeyStartOffset(), opacity: 1 });
    };
    if (keyEl && keyInnerEl) {
      placeKey();
      gsap.set(keyInnerEl, { y: 0, rotation: -24, scale: KEY_NEAR_SCALE, filter: KEY_NEAR_SHADOW });
    }
    window.addEventListener("resize", placeKey);
    return () => {
      tween.kill();
      window.removeEventListener("resize", placeKey);
    };
  }, [phase, isOpen, tier.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Offset that moves the preview key from its spot lined up with the keyhole to just
   * below the bottom-right of the screen, out of view (the key lives inside the crate's box).
   */
  function previewKeyStartOffset(): { x: number; y: number } {
    // The gold key (rare crate) enters from high on the left instead
    if (tier.id === "rare") return keyOffsetForScreenPoint(-140, window.innerHeight * 0.12);
    // The silver key (uncommon crate) falls in from above the top of the screen, beside the crate
    if (tier.id === "uncommon") {
      const floor = silverKeyFloorPoint();
      return keyOffsetForScreenPoint(floor.x, -120);
    }
    // Far enough below the bottom edge that the enlarged, tilted key is fully hidden
    return keyOffsetForScreenPoint(window.innerWidth - 90, window.innerHeight + 90);
  }

  /**
   * Where the silver key comes to rest on the floor: just right of the crate (kept on
   * screen on phones), lying on the line the crate stands on. Screen coordinates of its centre.
   */
  function silverKeyFloorPoint(): { x: number; y: number } {
    const crate = crateRef.current?.getBoundingClientRect();
    if (!crate) return { x: window.innerWidth * 0.75, y: window.innerHeight * 0.6 };
    return {
      x: Math.min(window.innerWidth - 60, crate.left + CRATE_SIZE + 70),
      // Lying flat: its centre half its (scaled) thickness above the floor
      y: crate.top + CRATE_SIZE - (28 / 2) * SILVER_KEY_FLOOR_SCALE,
    };
  }

  /** The preview key's x/y offset that puts its centre at a point on screen (it lives inside the crate's box). */
  function keyOffsetForScreenPoint(screenX: number, screenY: number): { x: number; y: number } {
    const crate = crateRef.current?.getBoundingClientRect();
    if (!crate) return { x: 0, y: 0 };
    return {
      x: screenX - (crate.left + KEY_LINEUP_LEFT + 36),
      y: screenY - (crate.top + KEY_LINEUP_TOP + 14),
    };
  }

  function burstParticles(color: string) {
    particles.forEach((p, i) => {
      const el = particleRefs.current[i];
      if (!el) return;
      el.style.background = color;
      el.style.borderRadius = p.isSquare ? "3px" : "50%";
      gsap.fromTo(
        el,
        { x: 0, y: 0, opacity: 1, scale: 1 },
        {
          x: Math.cos(p.angle) * p.distance,
          y: Math.sin(p.angle) * p.distance,
          opacity: 0,
          scale: 0,
          duration: 0.65 + Math.random() * 0.55,
          delay: p.delay,
          ease: "power2.out",
        }
      );
    });
  }

  /**
   * Flies the preview key up from below the screen to the keyhole on a gentle curve: a
   * quadratic whose control point sits just above the lock's height, so the key heads
   * fairly directly for the lock and only rises a few pixels above it before settling in.
   */
  function flyKeyInArc(keyEl: HTMLDivElement): Promise<void> {
    const startX = Number(gsap.getProperty(keyEl, "x")) || 0;
    return flyKeyAlong(keyEl, { x: 0, y: 0 }, { x: startX * 0.5, y: -KEY_ARC_LIFT }, KEY_FLIGHT_SECONDS);
  }

  /** Moves the preview key from where it is to `to` along a quadratic curve through `control`. */
  function flyKeyAlong(
    keyEl: HTMLDivElement,
    to: { x: number; y: number },
    control: { x: number; y: number },
    duration: number,
    ease = "power1.inOut"
  ): Promise<void> {
    const startX = Number(gsap.getProperty(keyEl, "x")) || 0;
    const startY = Number(gsap.getProperty(keyEl, "y")) || 0;
    const path = { t: 0 };
    return new Promise((resolve) => {
      gsap.to(path, {
        t: 1,
        duration,
        ease,
        onUpdate: () => {
          const t = path.t;
          const u = 1 - t;
          gsap.set(keyEl, {
            x: u * u * startX + 2 * u * t * control.x + t * t * to.x,
            y: u * u * startY + 2 * u * t * control.y + t * t * to.y,
          });
        },
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * The gold key's flourish: a single sparkle that twinkles on the edge of its handle (the
   * ring). Drawn inside the key itself, so it turns and grows with it.
   */
  function sparkleKey(keyInnerEl: HTMLDivElement): Promise<void> {
    const size = 14;
    const sparkle = document.createElement("div");
    sparkle.innerHTML = `<svg viewBox="0 0 20 20" width="${size}" height="${size}" style="display:block;overflow:visible"><path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0 Z" fill="#ffffff"/></svg>`;
    Object.assign(sparkle.style, {
      position: "absolute",
      // Top-right of the ring (centred at 58, 13.5 in the key drawing, radius 11)
      left: `${KEY_SPARKLE_AT.x - size / 2}px`,
      top: `${KEY_SPARKLE_AT.y - size / 2}px`,
      pointerEvents: "none",
      filter: "drop-shadow(0 0 3px rgba(255,230,140,1)) drop-shadow(0 0 8px rgba(255,210,80,0.8))",
    });
    keyInnerEl.appendChild(sparkle);
    return new Promise((resolve) => {
      gsap.fromTo(
        sparkle,
        { scale: 0, rotation: 0, opacity: 1 },
        {
          keyframes: [
            { scale: 1.4, rotation: 90, duration: 0.3, ease: "back.out(2.5)" },
            { scale: 1.1, rotation: 135, duration: 0.25, ease: "sine.inOut" },
            { scale: 0, rotation: 180, opacity: 0, duration: 0.3, ease: "power2.in" },
          ],
          onComplete: () => {
            sparkle.remove();
            resolve();
          },
        }
      );
    });
  }

  /**
   * A small puff of dust along the ground where the crate just landed: soft clouds that
   * billow out sideways from under it and fade. Drawn in the crate's parent (not the crate),
   * so the dust stays on the ground while the crate bounces.
   */
  function kickUpDust(container: HTMLElement, crateEl: HTMLElement) {
    const crate = crateEl.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    // The crate's bottom edge, in the container's coordinates (the crate is drawn at its full 160px)
    const groundY = crate.top - box.top + CRATE_SIZE;
    const centerX = crate.left - box.left + CRATE_SIZE / 2;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const size = 14 + Math.random() * 16;
      const puff = document.createElement("div");
      Object.assign(puff.style, {
        position: "absolute",
        left: `${centerX + side * (10 + Math.random() * 55) - size / 2}px`,
        top: `${groundY - size / 2 - Math.random() * 6}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(200,185,160,0.55) 0%, rgba(200,185,160,0.25) 45%, rgba(200,185,160,0) 70%)",
        pointerEvents: "none",
        zIndex: "0",
      });
      container.appendChild(puff);
      gsap.fromTo(
        puff,
        { x: 0, y: 0, scale: 0.4, opacity: 0.9 },
        {
          x: side * (40 + Math.random() * 70),
          y: -(4 + Math.random() * 18),
          scale: 1.5 + Math.random() * 0.8,
          opacity: 0,
          duration: 0.6 + Math.random() * 0.35,
          ease: "power2.out",
          onComplete: () => puff.remove(),
        }
      );
    }
  }

  async function handleOpen() {
    if (isOpening || points < tier.cost) return;

    const { item, rarity } = rollCrate(tier.odds, ownedCosmetics);
    setWonItem(item);
    setWonRarity(rarity);

    // Fire off the DB write in parallel — don't await it yet
    const dbPromise = onOpen(item.id);

    setIsOpening(true);

    const crateEl = crateRef.current!;
    const keyEl = keyRef.current!;
    const lidEl = lidRef.current!;
    const glowEl = glowRef.current!;
    const rarityConfig = RARITY_CONFIG[rarity];
    const previewKeyEl = previewKeyRef.current!;
    const titleEl = titleRef.current!;
    const previewKeyInnerEl = previewKeyInnerRef.current!;
    gsap.killTweensOf([crateEl, previewKeyEl, previewKeyInnerEl]);
    gsap.set(keyEl, { x: KEY_LINEUP_OFFSET, opacity: 0, scaleY: 1 });
    gsap.set(glowEl, {
      opacity: 0,
      scale: 0.6,
      background: `radial-gradient(ellipse at center, ${rarityConfig.color} 0%, ${rarityConfig.glowColor} 35%, rgba(0,0,0,0) 70%)`,
    });

    // ── The rarity list fades out ──
    await gsap.to(idlePanelRef.current, { opacity: 0, duration: 0.35, ease: "power1.out" });

    // ── Then the crate drops down to where it sits once the list is gone (FLIP) ──
    const crateY = Number(gsap.getProperty(crateEl, "y")) || 0;
    const keyY = Number(gsap.getProperty(previewKeyEl, "y")) || 0;
    const crateTopBefore = crateEl.getBoundingClientRect().top;
    const titleTopBefore = titleEl.getBoundingClientRect().top;
    flushSync(() => setPhase("unlocking"));
    const crateShift = crateTopBefore - crateEl.getBoundingClientRect().top;
    const titleShift = titleTopBefore - titleEl.getBoundingClientRect().top;
    const crateStartY = crateY + crateShift;
    // The key lives inside the crate's box: offset it against the crate's movement so it
    // stays put (off screen) while the crate falls and lands
    const holdKeyOnScreen = () => {
      gsap.set(previewKeyEl, { y: keyY + crateY + crateShift - Number(gsap.getProperty(crateEl, "y")) });
    };
    // The title also rises out of the way of the open lid and the prize that comes out later
    gsap.fromTo(titleEl, { y: titleShift }, { y: -125, duration: 0.5, ease: "power2.inOut" });
    await gsap.fromTo(
      crateEl,
      { y: crateStartY },
      {
        y: 0,
        duration: 0.45,
        ease: "power2.in",
        onUpdate: holdKeyOnScreen,
      }
    );
    // Lands with a little bounce; the rare crate kicks up a puff of dust as it hits
    if (tier.id === "rare" && crateEl.parentElement) kickUpDust(crateEl.parentElement, crateEl);
    await gsap.fromTo(crateEl, { y: 0 }, { y: -7, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out", onUpdate: holdKeyOnScreen });

    if (tier.id === "rare") {
      // A beat after the crate (and its dust) settles before the gold key appears
      await new Promise<void>((r) => setTimeout(r, GOLD_KEY_ENTRANCE_DELAY_MS));

      // ── Gold key: swings in from high on the left over to the empty dark space right of
      // the crate's column,
      // growing as it comes closer and turning smoothly to rest at 45° ──
      // Halfway between the right edge of the content column (max-w-sm, centred on the
      // crate) and the right edge of the screen; kept well inside the screen on phones
      const crateBox = crateEl.getBoundingClientRect();
      const columnRight = crateBox.left + crateBox.width / 2 + CONTENT_COLUMN_WIDTH / 2;
      const restX = Math.min(window.innerWidth - 90, Math.max(window.innerWidth * 0.72, (columnRight + window.innerWidth) / 2));
      const middle = keyOffsetForScreenPoint(restX, window.innerHeight * 0.4);
      const start = { x: Number(gsap.getProperty(previewKeyEl, "x")) || 0, y: Number(gsap.getProperty(previewKeyEl, "y")) || 0 };
      gsap.set(previewKeyInnerEl, { scale: GOLD_KEY_START_SCALE, rotation: GOLD_KEY_REST_ANGLE - 35 });
      const swing = Promise.all([
        // Sags below the straight line between the two points, like a swing, and slows
        // down as it arrives where it sparkles
        flyKeyAlong(previewKeyEl, middle, { x: (start.x + middle.x) / 2, y: Math.max(start.y, middle.y) + 160 }, GOLD_KEY_SWING_SECONDS, "power3.out"),
        // One continuous turn and grow, eased exactly like the movement, so the angle
        // changes smoothly the whole way with no sudden adjustments
        gsap.to(previewKeyInnerEl, {
          rotation: GOLD_KEY_REST_ANGLE,
          scale: GOLD_KEY_NEAR_SCALE,
          duration: GOLD_KEY_SWING_SECONDS,
          ease: "power3.out",
        }),
      ]);

      // ── A single sparkle on its handle, the moment the key comes to rest. The swing eases
      // out, so it's visibly stopped well before the tween formally ends: sparkle then ──
      await new Promise<void>((r) => setTimeout(r, GOLD_KEY_SWING_SECONDS * GOLD_KEY_SPARKLE_AT * 1000));
      await Promise.all([swing, sparkleKey(previewKeyInnerEl)]);

      // ── Then flies to the lock, bowing out to the right of a straight line and flipping
      // over its long side on the way ──
      gsap.set(previewKeyInnerEl, { transformPerspective: 500 });
      const from = { x: Number(gsap.getProperty(previewKeyEl, "x")) || 0, y: Number(gsap.getProperty(previewKeyEl, "y")) || 0 };
      await Promise.all([
        gsap.to(previewKeyInnerEl, {
          y: 0,
          rotation: 0,
          rotationX: 360,
          scale: 1,
          filter: KEY_LOCK_SHADOW,
          duration: GOLD_KEY_FLIGHT_SECONDS,
          ease: "power2.inOut",
        }),
        flyKeyAlong(
          previewKeyEl,
          { x: 0, y: 0 },
          // (but not past the right edge of the screen)
          {
            x: Math.min(Math.max(from.x, 0) + GOLD_KEY_FLIGHT_BOW, keyOffsetForScreenPoint(window.innerWidth - 60, 0).x),
            y: from.y / 2,
          },
          GOLD_KEY_FLIGHT_SECONDS,
          "power1.inOut"
        ),
      ]);
      gsap.set(previewKeyInnerEl, { rotationX: 0 });
    } else if (tier.id === "uncommon") {
      // ── Silver key: drops in from the top of the screen beside the crate, bounces a
      // little and settles on the floor ──
      const floor = keyOffsetForScreenPoint(silverKeyFloorPoint().x, silverKeyFloorPoint().y);
      gsap.set(previewKeyEl, { x: floor.x });
      // Pivots on its handle throughout (set now, while it's off screen, so changing it
      // never makes the enlarged key jump), ready to be picked up by it later
      gsap.set(previewKeyInnerEl, {
        transformOrigin: KEY_HANDLE_ORIGIN,
        y: 0,
        rotation: -25,
        scale: SILVER_KEY_FLOOR_SCALE,
        filter: KEY_NEAR_SHADOW,
      });
      await Promise.all([
        gsap.to(previewKeyEl, { y: floor.y, duration: 0.55, ease: "power2.in" }),
        // Tips level as it lands
        gsap.to(previewKeyInnerEl, { rotation: 0, duration: 0.55, ease: "power1.in" }),
      ]);
      // Small bounce, then a smaller one, and it's down
      await gsap.to(previewKeyEl, {
        keyframes: [
          { y: floor.y - 16, duration: 0.14, ease: "power2.out" },
          { y: floor.y, duration: 0.14, ease: "power2.in" },
          { y: floor.y - 5, duration: 0.08, ease: "power2.out" },
          { y: floor.y, duration: 0.08, ease: "power2.in" },
        ],
      });

      // ── A slight pause on the floor ──
      await new Promise<void>((r) => setTimeout(r, 450));

      // ── Picked up by its handle: the ring lifts first and the rest of the key swings down
      // under it, until it hangs from the handle (bit pointing at the floor) ──
      await Promise.all([
        gsap.to(previewKeyEl, { y: floor.y - SILVER_KEY_LIFT, duration: 0.45, ease: "power2.out" }),
        // The key trails the handle as it's lifted and swings down past straight, to the
        // far end of its first swing (where a pendulum momentarily stops)
        gsap.to(previewKeyInnerEl, { rotation: -90 - SILVER_KEY_SWAY_DEGREES, duration: 0.5, delay: 0.05, ease: "sine.out" }),
      ]);
      // ...then dangles, swinging gently back and forth like a pendulum, each swing a little
      // smaller, until it's carried off (the flight then turns it level from wherever it is).
      // Damped cosine: starts at that far end with no speed, so it carries on smoothly from the lift.
      const sway = { t: 0 };
      await gsap.to(sway, {
        t: SILVER_KEY_DANGLE_MS / 1000,
        duration: SILVER_KEY_DANGLE_MS / 1000,
        ease: "none",
        onUpdate: () => {
          const damping = Math.exp(-sway.t / SILVER_KEY_SWAY_DECAY);
          gsap.set(previewKeyInnerEl, {
            rotation: -90 - SILVER_KEY_SWAY_DEGREES * damping * Math.cos((2 * Math.PI * sway.t) / SILVER_KEY_SWAY_PERIOD),
          });
        },
      });

      // ── Then carried over to the lock, still held by the handle, turning level on the
      // way. Once it's level and full size the turning point no longer matters, so it lands
      // exactly in place; only then does the origin go back to the centre. ──
      const lifted = { x: Number(gsap.getProperty(previewKeyEl, "x")) || 0, y: Number(gsap.getProperty(previewKeyEl, "y")) || 0 };
      await Promise.all([
        gsap.to(previewKeyInnerEl, { rotation: 0, scale: 1, filter: KEY_LOCK_SHADOW, duration: 0.65, ease: "power2.inOut" }),
        flyKeyAlong(previewKeyEl, { x: 0, y: 0 }, { x: lifted.x * 0.4, y: Math.min(lifted.y, 0) - 30 }, 0.65, "power2.inOut"),
      ]);
      gsap.set(previewKeyInnerEl, { transformOrigin: "50% 50%" });
    } else {
      // ── Once the crate has landed, the key flies up from below the screen in its arc,
      // shrinking as it recedes from the viewer and levelling out at the keyhole (no spinning) ──
      await Promise.all([
        gsap.to(previewKeyInnerEl, {
          y: 0,
          rotation: 0,
          scale: 1,
          filter: KEY_LOCK_SHADOW,
          duration: KEY_FLIGHT_SECONDS,
          ease: "power2.inOut",
        }),
        flyKeyInArc(previewKeyEl),
      ]);
    }

    // Swap the free-floating key for the clipped one in the lock, at the same spot
    gsap.set(previewKeyEl, { opacity: 0 });
    gsap.set(keyEl, { opacity: 1 });

    if (tier.id === "common") {
      // ── Common crate: the key just slides in (everything past the keyhole is clipped away,
      // so the bit disappears into it) and turns ──
      await new Promise<void>((r) => setTimeout(r, 120));
      await gsap.to(keyEl, { x: 0, duration: 0.35, ease: "power2.in" });
      setShakeIntensity(1);
      await gsap.to(keyEl, { scaleY: 0.2, duration: 0.18, ease: "power1.in" });
      await gsap.to(keyEl, { scaleY: 1, duration: 0.18, ease: "power1.out" });
      // Click — the crate hops as the lock releases
      setShakeIntensity(2);
      await gsap.fromTo(crateEl, { y: 0 }, { y: -6, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out" });
    } else {
      // ── Key creeps right up to the lock and pauses, tip just outside the keyhole ──
      await gsap.to(keyEl, { x: KEY_INSERT_DEPTH + 4, duration: 0.25, ease: "power2.out" });
      await new Promise<void>((r) => setTimeout(r, 350));

      // ── Winds up: backs away from the lock ──
      await gsap.to(keyEl, { x: 62, duration: 0.22, ease: "power2.out" });

      // ── Slams in (everything past the keyhole is clipped away, so the bit disappears into
      // it) and turns as it hits ──
      await gsap.to(keyEl, { x: 0, duration: 0.08, ease: "power4.in" });
      setShakeIntensity(2);
      // The impact knocks the crate back, and it springs upright again
      gsap.fromTo(
        crateEl,
        { x: -9, rotation: -2.5 },
        { x: 0, rotation: 0, duration: 0.45, ease: "elastic.out(1.1, 0.35)" }
      );
      // Quick turn: squash on its long axis like it's rotating in the lock
      await gsap.to(keyEl, { scaleY: 0.15, duration: 0.08, ease: "power1.in" });
      await gsap.to(keyEl, { scaleY: 1, duration: 0.1, ease: "power1.out" });
      // Click — the crate jumps as the lock releases
      await gsap.fromTo(crateEl, { y: 0 }, { y: -9, duration: 0.07, yoyo: true, repeat: 1, ease: "power2.out" });
    }

    // ── Lid flips open on hinges at the back; light pours out in the rarity's colour ──
    setShakeIntensity(3);
    gsap.to(keyEl, { opacity: 0, duration: 0.25 });
    // The hinge runs along the back of the seam where the lid meets the base (the lid's
    // bottom edge, LID_DEPTH behind the front face), so the lid's back edge stays on the
    // crate. Swinging up around it lifts the front edge up and back, turning the lid's
    // underside toward us until it stands open on the crate, like a chest.
    // The lock plate is fixed to the lid, so it swings up with it.
    gsap.set(lidEl, { transformOrigin: `50% 100% ${-LID_DEPTH}px`, transformPerspective: LID_PERSPECTIVE });
    gsap.to(glowEl, { opacity: 1, scale: 1.6, duration: 0.35, ease: "power2.out" });
    await gsap
      .timeline()
      // In front of the base until upright, so the lock plate stays visible as it lifts off
      .to(lidEl, { rotationX: 90, duration: 0.2, ease: "power2.in" })
      // Then behind everything, so the prize rises in front of the open lid
      .set(lidEl, { zIndex: -1 })
      .to(lidEl, { rotationX: 105, duration: 0.25, ease: "back.out(2.5)" });

    // ── The prize rises up out of the crate ──
    burstParticles(rarityConfig.color);
    const prizeEl = prizeRef.current;
    if (prizeEl) {
      await gsap.fromTo(
        prizeEl,
        { y: 10, scale: 0.7 },
        { y: -105, scale: 1.35, duration: 0.85, ease: "back.out(1.4)" }
      );
      gsap.to(prizeEl, { y: -113, duration: 0.6, yoyo: true, repeat: -1, ease: "sine.inOut" });
    }
    await new Promise<void>((r) => setTimeout(r, 800));

    // ── Flash into the reveal ─────────────────────────────────────
    setPhase("flash");
    if (prizeEl) gsap.killTweensOf(prizeEl);
    gsap.to(flashRef.current, { opacity: 1, duration: 0.1 });
    gsap.to(crateEl, { scale: 1.3, opacity: 0, duration: 0.18, ease: "power2.out" });
    await new Promise<void>((r) => setTimeout(r, 300));

    // ── Item reveal ─────────────────────────────────────────────
    setPhase("item");
    gsap.to(flashRef.current, { opacity: 0, duration: 0.5, delay: 0.08 });

    // Extra screen shake for legendary
    if (rarity === "legendary" && overlayRef.current) {
      gsap.fromTo(
        overlayRef.current,
        { x: -7 },
        {
          x: 7,
          duration: 0.065,
          repeat: 9,
          yoyo: true,
          ease: "power1.inOut",
          clearProps: "x",
        }
      );
    }

    await new Promise<void>((r) => setTimeout(r, 90));
    if (itemCardRef.current) {
      gsap.fromTo(
        itemCardRef.current,
        { y: 60, opacity: 0, scale: 0.8 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.5)" }
      );
    }

    // Wait for the DB write (started in parallel) before allowing Continue
    const dbResult = await dbPromise;
    if (dbResult.success) {
      setFinalPoints(dbResult.newPoints);
      setIsDuplicate(dbResult.isDuplicate);
      setRefund(dbResult.refund);
    }

    await new Promise<void>((r) => setTimeout(r, 950));
    setCanClose(true);
  }

  if (!isOpen) return null;

  const config = RARITY_CONFIG[wonRarity];
  const canAfford = points >= tier.cost;

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes crateSparkle {
          0%,100% { opacity: 0.7; transform: scale(1) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.3) rotate(180deg); }
        }
        @keyframes legendaryRainbow {
          0% { filter: hue-rotate(0deg) drop-shadow(0 0 20px rgba(245,158,11,0.9)); }
          100% { filter: hue-rotate(360deg) drop-shadow(0 0 20px rgba(245,158,11,0.9)); }
        }
        @keyframes itemGlow {
          0%,100% { box-shadow: 0 0 30px var(--rarity-glow), 0 0 60px var(--rarity-glow-half); }
          50% { box-shadow: 0 0 50px var(--rarity-glow), 0 0 90px var(--rarity-glow-half), inset 0 0 20px var(--rarity-glow-quarter); }
        }
      `}</style>

      <div
        ref={overlayRef}
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 100, background: "rgba(0,0,0,0.93)" }}
      >
        {/* Rarity tinted background */}
        {phase === "item" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 60% 60% at 50% 50%, ${config.bgColor} 0%, rgba(0,0,0,0) 75%)`,
              transition: "background 0.6s ease",
            }}
          />
        )}

        {/* White flash */}
        <div
          ref={flashRef}
          className="absolute inset-0 bg-white pointer-events-none"
          style={{ opacity: 0 }}
        />

        {/* Particle burst layer */}
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{ overflow: "hidden" }}
        >
          {particles.map((p, i) => (
            <div
              key={p.id}
              ref={(el) => {
                particleRefs.current[i] = el;
              }}
              style={{
                position: "absolute",
                width: p.size,
                height: p.size,
                opacity: 0,
                borderRadius: p.isSquare ? 3 : "50%",
              }}
            />
          ))}
        </div>

        {/* Main content column */}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-8 text-center w-full max-w-sm">
          {/* ────── IDLE / SHAKING / FLASH ────── */}
          {(phase === "idle" || phase === "unlocking" || phase === "flash") && (
            <>
              {/* Moved up out of the prize's way when opening starts (see handleOpen) */}
              <div ref={titleRef} className="space-y-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">{tier.name}</h2>
                <p className="text-sm text-gray-400">{tier.description}</p>
              </div>

              <div ref={crateRef} className="relative">
                {/* Preview key: waits below the bottom of the screen, then arcs up to the keyhole on open */}
                <div
                  ref={previewKeyRef}
                  style={{ position: "absolute", left: KEY_LINEUP_LEFT, top: KEY_LINEUP_TOP, zIndex: 6, pointerEvents: "none", opacity: 0 }}
                >
                  <div ref={previewKeyInnerRef}>
                    <KeyGraphic metal={(CRATE_PALETTES[tier.id] ?? CRATE_PALETTES.common).lock.metal} />
                  </div>
                </div>
                <CrateVisual
                  tier={tier.id}
                  intensity={shakeIntensity}
                  parts={{
                    lid: lidRef,
                    lock: lockRef,
                    key: keyRef,
                    glow: glowRef,
                    prize: {
                      ref: prizeRef,
                      content: wonItem && (
                        <div
                          style={
                            wonRarity === "legendary"
                              ? { animation: "legendaryRainbow 3s linear infinite" }
                              : { filter: `drop-shadow(0 0 14px ${config.glowColor})` }
                          }
                        >
                          {wonItem.emoji && <span style={{ fontSize: 56, lineHeight: 1 }}>{wonItem.emoji}</span>}
                          {wonItem.url && (
                            <img src={wonItem.url} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} />
                          )}
                        </div>
                      ),
                    },
                  }}
                />
              </div>

              {phase === "idle" && (
                <div ref={idlePanelRef} className="w-full flex flex-col items-center gap-6">
                  {/* Rarity odds table */}
                  <div className="w-full rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 text-xs">
                    <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-2">
                      Rarity Chances
                    </p>
                    {(["common", "uncommon", "rare", "ultra-rare", "legendary"] as CrateRarity[]).map((r) => (
                      <div key={r} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: RARITY_CONFIG[r].color }}
                          />
                          <span className="text-gray-300">{RARITY_CONFIG[r].label}</span>
                        </div>
                        <span className="font-mono text-gray-400">{Math.round(tier.odds[r] * 100)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Points & open button */}
                  <div className="w-full space-y-2.5">
                    <div className="flex items-center justify-between text-sm px-1">
                      <span className="text-gray-400">Your balance</span>
                      <span
                        className={`font-semibold ${
                          canAfford ? "text-yellow-400" : "text-red-400"
                        }`}
                      >
                        {points.toLocaleString()} pts
                      </span>
                    </div>

                    <Button
                      className="w-full text-base font-bold h-12 gap-2 transition-all"
                      style={
                        canAfford
                          ? {
                              background:
                                "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                              boxShadow: "0 0 20px rgba(217,119,6,0.4)",
                              color: "#fff",
                            }
                          : {}
                      }
                      disabled={!canAfford || isOpening}
                      onClick={handleOpen}
                    >
                      <Coins className="h-5 w-5" />
                      Open Crate — {tier.cost} pts
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full text-gray-500 hover:text-gray-300"
                      onClick={() => onClose()}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ────── ITEM REVEAL ────── */}
          {phase === "item" && wonItem && (
            <div
              ref={itemCardRef}
              className="flex flex-col items-center gap-4 w-full"
              style={{ opacity: 0 }}
            >
              <p
                className="text-xs font-bold uppercase tracking-[0.3em]"
                style={{ color: config.color }}
              >
                {config.label}
              </p>

              <div
                className="relative flex flex-col items-center gap-4 p-7 rounded-2xl border-2 w-full"
                style={{
                  borderColor: `${config.color}55`,
                  background: `radial-gradient(ellipse at center, ${config.bgColor} 0%, rgba(0,0,0,0.6) 100%)`,
                  // @ts-expect-error CSS custom property
                  "--rarity-glow": config.glowColor,
                  "--rarity-glow-half": config.glowColor.replace("0.9", "0.45").replace("0.75", "0.38"),
                  "--rarity-glow-quarter": config.glowColor.replace("0.9", "0.2").replace("0.75", "0.18"),
                  animation: "itemGlow 2s ease-in-out infinite",
                }}
              >
                <span
                  className="absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    background: `${config.color}22`,
                    color: config.color,
                    border: `1px solid ${config.color}55`,
                  }}
                >
                  {CATEGORY_LABEL[wonItem.category]}
                </span>

                {/* Legendary gets rainbow spin */}
                <div
                  style={
                    wonRarity === "legendary"
                      ? { animation: "legendaryRainbow 3s linear infinite" }
                      : {
                          filter: `drop-shadow(0 0 18px ${config.glowColor})`,
                        }
                  }
                >
                  {wonItem.emoji && (
                    <span style={{ fontSize: 80, lineHeight: 1 }}>{wonItem.emoji}</span>
                  )}
                  {wonItem.url && (
                    <img src={wonItem.url} alt={wonItem.name} style={{ width: 80, height: 80, objectFit: "contain" }} />
                  )}
                </div>

                <div className="space-y-1.5 text-center">
                  <p className="text-xl font-bold text-white">{wonItem.name}</p>
                  <p className="text-sm text-gray-400 leading-snug">{wonItem.description}</p>
                </div>

                {isDuplicate && (
                  <div
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: "rgba(156,163,175,0.15)",
                      color: "#9ca3af",
                      border: "1px solid rgba(156,163,175,0.3)",
                    }}
                  >
                    Already Owned{refund > 0 ? ` — refunded ${refund} pts` : ""}
                  </div>
                )}
              </div>

              {canClose ? (
                <Button
                  className="w-full font-bold h-11 text-base"
                  style={{
                    background: config.color,
                    color: wonRarity === "legendary" || wonRarity === "uncommon" ? "#000" : "#fff",
                  }}
                  onClick={() => onClose(finalPoints ?? undefined)}
                >
                  Continue
                </Button>
              ) : (
                <div className="h-11 flex items-center justify-center">
                  <div
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: config.color }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
