import React, { useState, useEffect, useRef, useMemo } from "react";
import { gsap } from "gsap";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COSMETICS, RARITY_CONFIG, type CosmeticDefinition, type CrateRarity } from "@/config/cosmetics";
import { CRATE_COST } from "@/lib/shopService";

// ---------------------------------------------------------------------------
// Roll logic (client-side)
// ---------------------------------------------------------------------------
export function rollCrate(): { item: CosmeticDefinition; rarity: CrateRarity } {
  const rand = Math.random();
  let selectedRarity: CrateRarity;
  if (rand < 0.01) selectedRarity = "legendary";
  else if (rand < 0.05) selectedRarity = "ultra-rare";
  else if (rand < 0.20) selectedRarity = "rare";
  else if (rand < 0.50) selectedRarity = "uncommon";
  else selectedRarity = "common";

  const pool = COSMETICS.filter((c) => c.rarity === selectedRarity);
  const item = pool[Math.floor(Math.random() * pool.length)];
  return { item, rarity: selectedRarity };
}

// ---------------------------------------------------------------------------
// Crate visual
// ---------------------------------------------------------------------------
function CrateVisual({ intensity = 0 }: { intensity?: number }) {
  // Intensity 0 = idle glow, 1-3 = shake stages (warm gold glow, not rarity-revealing)
  const glowColor =
    intensity === 0
      ? undefined
      : intensity === 1
      ? "rgba(200,150,50,0.45)"
      : intensity === 2
      ? "rgba(220,165,60,0.65)"
      : "rgba(245,185,70,0.9)";

  return (
    <div
      style={{
        width: 160,
        height: 160,
        background: "linear-gradient(145deg, #c48940 0%, #8b5520 42%, #6a3e10 100%)",
        border: "5px solid #3b2008",
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        filter: glowColor
          ? `drop-shadow(0 0 14px ${glowColor}) drop-shadow(0 0 36px ${glowColor})`
          : "drop-shadow(0 8px 24px rgba(0,0,0,0.7))",
        transition: "filter 0.3s ease",
      }}
    >
      {/* Lid band */}
      <div
        style={{
          position: "absolute",
          top: "28%",
          left: 0,
          right: 0,
          height: 5,
          background: "#2d1600",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.12)",
        }}
      />

      {/* Wood grain horizontal lines */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(0,0,0,0.07) 26px, rgba(0,0,0,0.07) 28px)",
          borderRadius: 5,
        }}
      />

      {/* SVG X struts */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        preserveAspectRatio="none"
      >
        {/* Bottom section X */}
        <line x1="0" y1="33%" x2="50%" y2="100%" stroke="#2d1600" strokeWidth="3.5" opacity="0.52" />
        <line x1="100%" y1="33%" x2="50%" y2="100%" stroke="#2d1600" strokeWidth="3.5" opacity="0.52" />
        {/* Top section X */}
        <line x1="0" y1="0" x2="50%" y2="30%" stroke="#2d1600" strokeWidth="2.5" opacity="0.42" />
        <line x1="100%" y1="0" x2="50%" y2="30%" stroke="#2d1600" strokeWidth="2.5" opacity="0.42" />
      </svg>

      {/* Sheen highlight on lid */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "28%",
          background: "linear-gradient(180deg, rgba(255,210,110,0.28) 0%, rgba(255,210,110,0) 100%)",
        }}
      />

      {/* Corner bolts */}
      {(
        [
          { top: 7, left: 7 },
          { top: 7, right: 7 },
          { bottom: 7, left: 7 },
          { bottom: 7, right: 7 },
        ] as React.CSSProperties[]
      ).map((pos, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #e2e2e2 0%, #888 100%)",
            border: "1.5px solid #555",
            boxShadow: "inset 0 1.5px 2.5px rgba(255,255,255,0.6), 0 1.5px 3px rgba(0,0,0,0.5)",
            ...pos,
          }}
        />
      ))}

      {/* Big ? mark */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "20%",
          fontSize: 56,
          fontWeight: 900,
          color: "rgba(255,220,100,0.16)",
          userSelect: "none",
        }}
      >
        ?
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const PARTICLE_COUNT = 30;

type Phase = "idle" | "shaking" | "flash" | "rarity" | "item";

interface Props {
  isOpen: boolean;
  points: number;
  ownedCosmetics: string[];
  onOpen: (
    itemId: string
  ) => Promise<{ success: boolean; newPoints: number; isDuplicate: boolean }>;
  onClose: (newPoints?: number) => void;
}

export function CrateOpeningAnimation({ isOpen, points, ownedCosmetics, onOpen, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [isOpening, setIsOpening] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [wonItem, setWonItem] = useState<CosmeticDefinition | null>(null);
  const [wonRarity, setWonRarity] = useState<CrateRarity>("common");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [finalPoints, setFinalPoints] = useState<number | null>(null);
  const [shakeIntensity, setShakeIntensity] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const crateRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const rarityTextRef = useRef<HTMLDivElement>(null);
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
    return () => {
      tween.kill();
    };
  }, [phase]);

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

  async function handleOpen() {
    if (isOpening || points < CRATE_COST) return;

    const { item, rarity } = rollCrate();
    setWonItem(item);
    setWonRarity(rarity);

    // Fire off the DB write in parallel — don't await it yet
    const dbPromise = onOpen(item.id);

    setIsOpening(true);
    setPhase("shaking");

    const crateEl = crateRef.current!;
    gsap.killTweensOf(crateEl);
    gsap.set(crateEl, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });

    // ── Stage 1: Gentle shake ──────────────────────────────────
    setShakeIntensity(1);
    await gsap.fromTo(
      crateEl,
      { x: -8 },
      { x: 8, duration: 0.1, repeat: 7, yoyo: true, ease: "power1.inOut" }
    );
    gsap.set(crateEl, { x: 0 });

    // ── Stage 2: Medium shake + rotation ──────────────────────
    setShakeIntensity(2);
    await gsap.fromTo(
      crateEl,
      { x: -16, rotation: -4 },
      { x: 16, rotation: 4, duration: 0.075, repeat: 9, yoyo: true }
    );
    gsap.set(crateEl, { x: 0, rotation: 0 });

    // ── Stage 3: Intense shake ─────────────────────────────────
    setShakeIntensity(3);
    await gsap.fromTo(
      crateEl,
      { x: -24, y: -7, rotation: -7 },
      {
        x: 24,
        y: 7,
        rotation: 7,
        duration: 0.048,
        repeat: 16,
        yoyo: true,
        ease: "power3.inOut",
      }
    );
    gsap.set(crateEl, { x: 0, y: 0, rotation: 0 });

    // ── Explosion flash ─────────────────────────────────────────
    setPhase("flash");
    gsap.to(flashRef.current, { opacity: 1, duration: 0.07 });
    gsap.to(crateEl, { scale: 1.5, opacity: 0, duration: 0.13, ease: "power2.out" });
    await new Promise<void>((r) => setTimeout(r, 300));

    // ── Rarity reveal ───────────────────────────────────────────
    const config = RARITY_CONFIG[rarity];
    setPhase("rarity");
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
    if (rarityTextRef.current) {
      gsap.fromTo(
        rarityTextRef.current,
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.52, ease: "back.out(1.8)" }
      );
    }

    burstParticles(config.color);

    // Wait for DB to finish in the background
    const dbResult = await dbPromise;
    if (dbResult.success) {
      setFinalPoints(dbResult.newPoints);
      setIsDuplicate(dbResult.isDuplicate);
    }

    await new Promise<void>((r) => setTimeout(r, 1850));

    // ── Item reveal ─────────────────────────────────────────────
    setPhase("item");
    await new Promise<void>((r) => setTimeout(r, 90));
    if (itemCardRef.current) {
      gsap.fromTo(
        itemCardRef.current,
        { y: 60, opacity: 0, scale: 0.8 },
        { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: "back.out(1.5)" }
      );
    }

    await new Promise<void>((r) => setTimeout(r, 950));
    setCanClose(true);
  }

  if (!isOpen) return null;

  const config = RARITY_CONFIG[wonRarity];
  const canAfford = points >= CRATE_COST;

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes crateSparkle {
          0%,100% { opacity: 0.7; transform: scale(1) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.3) rotate(180deg); }
        }
        @keyframes rarityPulse {
          0%,100% { text-shadow: 0 0 30px var(--rarity-glow), 0 0 60px var(--rarity-glow); }
          50% { text-shadow: 0 0 50px var(--rarity-glow), 0 0 100px var(--rarity-glow), 0 0 140px var(--rarity-glow); }
        }
        @keyframes legendaryRainbow {
          0% { filter: hue-rotate(0deg) drop-shadow(0 0 20px rgba(245,158,11,0.9)); }
          100% { filter: hue-rotate(360deg) drop-shadow(0 0 20px rgba(245,158,11,0.9)); }
        }
        @keyframes itemGlow {
          0%,100% { box-shadow: 0 0 30px var(--rarity-glow), 0 0 60px var(--rarity-glow-half); }
          50% { box-shadow: 0 0 50px var(--rarity-glow), 0 0 90px var(--rarity-glow-half), inset 0 0 20px var(--rarity-glow-quarter); }
        }
        @keyframes floatSparkle {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-60px) scale(0); opacity: 0; }
        }
      `}</style>

      <div
        ref={overlayRef}
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: 100, background: "rgba(0,0,0,0.93)" }}
      >
        {/* Rarity tinted background */}
        {(phase === "rarity" || phase === "item") && (
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
          {(phase === "idle" || phase === "shaking" || phase === "flash") && (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white tracking-tight">Mystery Crate</h2>
                <p className="text-sm text-gray-400">Open to receive a random cosmetic!</p>
              </div>

              <div ref={crateRef}>
                <CrateVisual intensity={shakeIntensity} />
              </div>

              {phase === "idle" && (
                <>
                  {/* Rarity odds table */}
                  <div className="w-full rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 text-xs">
                    <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-2">
                      Rarity Chances
                    </p>
                    {(
                      [
                        ["common", "50%"],
                        ["uncommon", "30%"],
                        ["rare", "15%"],
                        ["ultra-rare", "4%"],
                        ["legendary", "1%"],
                      ] as [CrateRarity, string][]
                    ).map(([r, pct]) => (
                      <div key={r} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: RARITY_CONFIG[r].color }}
                          />
                          <span className="text-gray-300">{RARITY_CONFIG[r].label}</span>
                        </div>
                        <span className="font-mono text-gray-400">{pct}</span>
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
                      Open Crate — {CRATE_COST} pts
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full text-gray-500 hover:text-gray-300"
                      onClick={() => onClose()}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {/* Shaking phase message */}
              {phase === "shaking" && (
                <p className="text-yellow-400 font-bold text-lg animate-pulse tracking-wide">
                  {shakeIntensity === 1 && "Something's inside..."}
                  {shakeIntensity === 2 && "It's getting restless!"}
                  {shakeIntensity === 3 && "IT'S ABOUT TO BURST! 🔥"}
                </p>
              )}
            </>
          )}

          {/* ────── RARITY REVEAL ────── */}
          {phase === "rarity" && (
            <div className="flex flex-col items-center gap-3">
              {/* Floating sparkles around the text */}
              <div className="relative">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: `${20 + Math.sin((i / 6) * Math.PI * 2) * 60}%`,
                      left: `${50 + Math.cos((i / 6) * Math.PI * 2) * 120}%`,
                      fontSize: 18,
                      animation: `floatSparkle ${0.8 + i * 0.15}s ease-out forwards`,
                      animationDelay: `${i * 0.12}s`,
                      pointerEvents: "none",
                    }}
                  >
                    ✨
                  </div>
                ))}

                <div ref={rarityTextRef} className="space-y-2" style={{ opacity: 0 }}>
                  <p className="text-base text-gray-400 uppercase tracking-[0.3em]">You got a</p>
                  <p
                    className="font-black leading-none"
                    style={{
                      fontSize:
                        wonRarity === "legendary"
                          ? 68
                          : wonRarity === "ultra-rare"
                          ? 58
                          : 50,
                      color: config.color,
                      fontFamily: '"Arial Black", "Impact", sans-serif',
                      // @ts-expect-error CSS custom property
                      "--rarity-glow": config.glowColor,
                      animation: "rarityPulse 1.4s ease-in-out infinite",
                      textShadow: `0 0 30px ${config.glowColor}, 0 0 60px ${config.glowColor}`,
                    }}
                  >
                    {config.label}
                  </p>
                  <p className="text-gray-400 text-base min-h-[1.5rem]">
                    {wonRarity === "legendary"
                      ? "😱 UNBELIEVABLE!!"
                      : wonRarity === "ultra-rare"
                      ? "🤩 Amazing pull!"
                      : wonRarity === "rare"
                      ? "✨ Nice one!"
                      : wonRarity === "uncommon"
                      ? "😊 Pretty good!"
                      : ""}
                  </p>
                </div>
              </div>
            </div>
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
                className="flex flex-col items-center gap-4 p-7 rounded-2xl border-2 w-full"
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
                  <span style={{ fontSize: 80, lineHeight: 1 }}>{wonItem.emoji}</span>
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
                    Already Owned
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
