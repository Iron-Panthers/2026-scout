import React, { useState, useEffect, useRef, useMemo } from "react";
import { flushSync } from "react-dom";
import { gsap } from "gsap";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COSMETICS, RARITY_CONFIG, type CosmeticDefinition, type CosmeticCategory, type CrateRarity } from "@/config/cosmetics";
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
    (c) => c.rarity === selectedRarity && c.currency !== "event" && !c.default && c.category !== "theme"
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
const WOOD = "linear-gradient(145deg, #c48940 0%, #8b5520 42%, #6a3e10 100%)";
const WOOD_GRAIN =
  "repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(0,0,0,0.07) 26px, rgba(0,0,0,0.07) 28px)";

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
/** How long the key's arcing flight from the corner of the screen to the keyhole takes. */
const KEY_FLIGHT_SECONDS = 1.3;
/** Where the lined-up key sits, in crate coordinates. */
const KEY_LINEUP_LEFT = KEYHOLE_X - KEY_INSERT_DEPTH + KEY_LINEUP_OFFSET;
const KEY_LINEUP_TOP = KEYHOLE_Y - KEY_SHAFT_Y;

/** A silver key lying sideways, bit on the left so it slides left into the keyhole. */
function KeyGraphic() {
  return (
    <svg width="72" height="28" viewBox="0 0 72 28" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="crate-key-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="55%" stopColor="#b6bcc6" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
      </defs>
      {/* Bit teeth */}
      <path d="M2 14 V20 H6 V17 H10 V21 H14 V14 Z" fill="url(#crate-key-silver)" stroke="#4b5563" strokeWidth="1" />
      {/* Shaft */}
      <rect x="1" y="11" width="46" height="5" rx="1.5" fill="url(#crate-key-silver)" stroke="#4b5563" strokeWidth="1" />
      {/* Bow */}
      <circle cx="58" cy="13.5" r="11" fill="url(#crate-key-silver)" stroke="#4b5563" strokeWidth="1.2" />
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
  parts = {},
}: {
  intensity?: number;
  size?: number;
  parts?: CrateParts;
}) {
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
            background: WOOD,
            border: "5px solid #3b2008",
            borderTop: "4px solid #2d1600",
            borderRadius: "0 0 10px 10px",
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: WOOD_GRAIN }} />
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
              background: WOOD,
              border: "5px solid #3b2008",
              borderRadius: "10px 10px 3px 3px",
              overflow: "hidden",
              boxShadow: "0 3px 4px rgba(0,0,0,0.45)",
              backfaceVisibility: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: WOOD_GRAIN }} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(255,210,110,0.28) 0%, rgba(255,210,110,0) 100%)",
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
              background: "linear-gradient(180deg, #4a2a0c 0%, #5e3712 60%, #6f4216 100%)",
              border: "5px solid #2d1600",
              borderRadius: 3,
              boxShadow: "inset 0 0 14px rgba(0,0,0,0.6)",
              backfaceVisibility: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: WOOD_GRAIN }} />
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
              borderRadius: "6px 6px 10px 10px",
              background: "linear-gradient(160deg, #f1f5f9 0%, #a8b0bc 55%, #5b6370 100%)",
              border: "2px solid #4b5563",
              boxShadow: "inset 0 1.5px 2px rgba(255,255,255,0.55), 0 2px 4px rgba(0,0,0,0.5)",
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
                background: "#1c0d02",
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
                borderBottom: "11px solid #1c0d02",
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
              <KeyGraphic />
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

  // Idle float animation
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
  }, [phase]);

  /**
   * Offset that moves the preview key from its spot lined up with the keyhole to just
   * below the bottom-right of the screen, out of view (the key lives inside the crate's box).
   */
  function previewKeyStartOffset(): { x: number; y: number } {
    const crate = crateRef.current?.getBoundingClientRect();
    if (!crate) return { x: 0, y: 0 };
    const keyCenterX = crate.left + KEY_LINEUP_LEFT + 36;
    const keyCenterY = crate.top + KEY_LINEUP_TOP + 14;
    return {
      x: window.innerWidth - 90 - keyCenterX,
      // Far enough below the bottom edge that the enlarged, tilted key is fully hidden
      y: window.innerHeight + 90 - keyCenterY,
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
   * Flies the preview key up from below the screen to the keyhole along a wide arc: a
   * quadratic curve whose control point swings far up and out to the right, so the key
   * rises up the side of the screen, sweeps over, and drops in toward the lock.
   */
  function flyKeyInArc(keyEl: HTMLDivElement): Promise<void> {
    const startX = Number(gsap.getProperty(keyEl, "x")) || 0;
    const startY = Number(gsap.getProperty(keyEl, "y")) || 0;
    const controlX = startX + 60;
    const controlY = -Math.max(220, Math.abs(startY) * 0.9);
    const path = { t: 0 };
    return new Promise((resolve) => {
      gsap.to(path, {
        t: 1,
        duration: KEY_FLIGHT_SECONDS,
        ease: "power1.inOut",
        onUpdate: () => {
          const t = path.t;
          const u = 1 - t;
          gsap.set(keyEl, {
            x: u * u * startX + 2 * u * t * controlX,
            y: u * u * startY + 2 * u * t * controlY,
          });
        },
        onComplete: () => resolve(),
      });
    });
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
    // Lands with a little bounce
    await gsap.fromTo(crateEl, { y: 0 }, { y: -7, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out", onUpdate: holdKeyOnScreen });

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

    // Swap the free-floating key for the clipped one in the lock, at the same spot
    gsap.set(previewKeyEl, { opacity: 0 });
    gsap.set(keyEl, { opacity: 1 });

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
                    <KeyGraphic />
                  </div>
                </div>
                <CrateVisual
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
