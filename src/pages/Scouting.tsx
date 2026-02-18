import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Undo2, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { useScoutingReducer } from "@/lib/useScoutingReducer";
import { useMatchTimer } from "@/lib/useMatchTimer";
import StartMatchOverlay from "@/components/scouting/StartMatchOverlay";
import fieldImage from "@/assets/FE-2026-_REBUILT_Playing_Field_With_Fuel.png";

export default function Scouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const match_id = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || "";
  const event_code = searchParams.get("event_code") || "";
  const match_number = parseInt(searchParams.get("match_number") || "0");
  const team_number = parseInt(searchParams.get("team_number") || "0");
  const match_type = searchParams.get("type") || "qual";

  const { state, set, logEvent, undo, canUndo } = useScoutingReducer(
    match_id || "",
    role || "",
    event_code,
    match_number,
    team_number,
    match_type
  );

  const { hasStarted, startMatch: startMatchTimer, currentPhase } = useMatchTimer();

  const PHASE_LABELS: Record<string, string> = {
    auto: "Auto",
    "transition-shift": "T-Shift",
    phase1: "Shift 1",
    phase2: "Shift 2",
    phase3: "Shift 3",
    phase4: "Shift 4",
    endgame: "Endgame",
  };

  const startMatch = () => {
    set("matchStartTime", Date.now());
    startMatchTimer();
  };

  const [frame, setFrame] = useState<1 | 2>(1);

  // ── Dot drag state ──────────────────────────────────────────────────────
  const draggingDot = useRef<"primary" | "secondary" | null>(null);
  const pendingDotPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dotPreview, setDotPreview] = useState<{
    which: "primary" | "secondary";
    x: number;
    y: number;
  } | null>(null);

  // Tracks the actual rendered image rect within the container (px, relative to container top-left).
  // Needed because object-contain leaves letterbox/pillarbox space that should not count.
  const [imgBounds, setImgBounds] = useState<{
    x: number; y: number; w: number; h: number;
  } | null>(null);

  const updateImgBounds = useCallback(() => {
    const container = imgContainerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return;

    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const iAspect = img.naturalWidth / img.naturalHeight;
    const cAspect = cW / cH;

    let iW: number, iH: number, iX: number, iY: number;
    if (cAspect > iAspect) {
      // Wider container → pillarboxed (empty on left/right)
      iH = cH; iW = cH * iAspect;
      iX = (cW - iW) / 2; iY = 0;
    } else {
      // Taller container → letterboxed (empty on top/bottom)
      iW = cW; iH = cW / iAspect;
      iX = 0; iY = (cH - iH) / 2;
    }
    setImgBounds({ x: iX, y: iY, w: iW, h: iH });
  }, []);

  // Set up ResizeObserver when Frame 2 mounts
  useEffect(() => {
    if (frame !== 2) return;
    const container = imgContainerRef.current;
    if (!container) return;
    updateImgBounds();
    const ro = new ResizeObserver(updateImgBounds);
    ro.observe(container);
    return () => ro.disconnect();
  }, [frame, updateImgBounds]);

  // Convert viewport pointer coords → normalized image coords (0–1 from image top-left).
  // Returns null if bounds not ready.
  const getNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = imgContainerRef.current;
      if (!container || !imgBounds) return null;
      const rect = container.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      return {
        x: Math.min(1, Math.max(0, (relX - imgBounds.x) / imgBounds.w)),
        y: Math.min(1, Math.max(0, (relY - imgBounds.y) / imgBounds.h)),
      };
    },
    [imgBounds]
  );

  // Convert normalized image coords → px offset from container top-left (for absolute positioning).
  const toContainerPx = (pos: { x: number; y: number }) =>
    imgBounds
      ? { left: imgBounds.x + pos.x * imgBounds.w, top: imgBounds.y + pos.y * imgBounds.h }
      : null;

  const handleDotPointerDown = (e: React.PointerEvent, which: "primary" | "secondary") => {
    e.stopPropagation();
    draggingDot.current = which;
    hasMoved.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (draggingDot.current === null) return;
    hasMoved.current = true;
    const pos = getNormalized(e.clientX, e.clientY);
    if (!pos) return;
    pendingDotPos.current = pos;
    setDotPreview({ which: draggingDot.current, ...pos });
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (draggingDot.current !== null) {
      if (hasMoved.current && pendingDotPos.current) {
        const key = draggingDot.current === "primary" ? "primaryShotPosition" : "secondaryShotPosition";
        set(key, pendingDotPos.current);
      }
      draggingDot.current = null;
      pendingDotPos.current = null;
      setDotPreview(null);
    } else {
      const pos = getNormalized(e.clientX, e.clientY);
      if (!pos) return;
      if (state.primaryShotPosition === null) {
        set("primaryShotPosition", pos);
      } else if (state.secondaryShotPosition === null) {
        set("secondaryShotPosition", pos);
      }
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const shotCount = state.shots.length;
  const bumpCount = state.events.filter((e) => e.name === "bump").length;
  const trenchCount = state.events.filter((e) => e.name === "trench").length;
  const headerLabel = `Team ${team_number || "?"} — Match ${match_number || "?"}`;

  const addShots = (count: number) => {
    const ts = state.matchStartTime ? (Date.now() - state.matchStartTime) / 1000 : 0;
    set("shots", [...state.shots, ...Array(count).fill(ts)]);
  };

  const handleFinish = async () => {
    const { compressState } = await import("@/lib/stateCompression");
    navigate(`/review/${compressState(state)}`);
  };

  // Use preview coords during drag, otherwise committed state
  const primaryPos = dotPreview?.which === "primary" ? dotPreview : state.primaryShotPosition;
  const secondaryPos = dotPreview?.which === "secondary" ? dotPreview : state.secondaryShotPosition;

  // ── Reusable action button snippets ────────────────────────────────────
  const undoBtn = (extraClass = "") => (
    <button
      className={`flex flex-col items-center justify-center gap-1 transition-colors
        ${canUndo
          ? "bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 dark:hover:bg-rose-900/60 active:bg-rose-300 dark:active:bg-rose-900/70 text-rose-700 dark:text-rose-300"
          : "bg-muted/40 text-muted-foreground/40 pointer-events-none"
        } ${extraClass}`}
      onPointerDown={(e) => { e.preventDefault(); if (canUndo) undo(); }}
    >
      <Undo2 className="w-6 h-6" />
      <span className="text-xs font-medium">Undo</span>
    </button>
  );

  const nextBtn = (extraClass = "") => (
    <button
      className={`flex flex-col items-center justify-center gap-1
        bg-violet-100 dark:bg-violet-950/50
        hover:bg-violet-200 dark:hover:bg-violet-900/60
        active:bg-violet-300 dark:active:bg-violet-900/70
        text-violet-700 dark:text-violet-300 transition-colors ${extraClass}`}
      onPointerDown={(e) => { e.preventDefault(); setFrame(2); }}
    >
      <ArrowRight className="w-6 h-6" />
      <span className="text-xs font-medium">Next</span>
    </button>
  );

  const backBtn = (extraClass = "") => (
    <button
      className={`flex flex-col items-center justify-center gap-1
        bg-amber-100 dark:bg-amber-950/50
        hover:bg-amber-200 dark:hover:bg-amber-900/60
        active:bg-amber-300 dark:active:bg-amber-900/70
        text-amber-700 dark:text-amber-300 transition-colors ${extraClass}`}
      onPointerDown={(e) => { e.preventDefault(); setFrame(1); }}
    >
      <ArrowLeft className="w-6 h-6" />
      <span className="text-xs font-medium">Back</span>
    </button>
  );

  const finishBtn = (extraClass = "") => (
    <button
      className={`flex flex-col items-center justify-center gap-1
        bg-violet-100 dark:bg-violet-950/50
        hover:bg-violet-200 dark:hover:bg-violet-900/60
        active:bg-violet-300 dark:active:bg-violet-900/70
        text-violet-700 dark:text-violet-300 transition-colors ${extraClass}`}
      onPointerDown={(e) => { e.preventDefault(); handleFinish(); }}
    >
      <Check className="w-6 h-6" />
      <span className="text-xs font-medium">Finish</span>
    </button>
  );

  // ── Header (shared) ─────────────────────────────────────────────────────
  const Header = () => (
    <div className="h-12 border-b border-border flex items-center px-4 shrink-0 bg-card gap-2">
      <span className="font-semibold text-sm">{headerLabel}</span>
      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{role}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Phase</span>
        <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full tabular-nums">
          {PHASE_LABELS[currentPhase] ?? currentPhase}
        </span>
      </div>
    </div>
  );

  // ── Frame 1 ─────────────────────────────────────────────────────────────
  const Frame1 = () => (
    <div className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background">
      <Header />

      {/* Main button grid */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Col 1: Shot buttons + score badge */}
        <div className="relative flex flex-col flex-[5] border-r border-border">
          {/* +20 */}
          <button
            className="flex-1 flex flex-col items-center justify-center
              bg-amber-100 dark:bg-amber-950/50
              hover:bg-amber-200 dark:hover:bg-amber-900/60
              active:bg-amber-300 dark:active:bg-amber-900/70
              border-b border-border transition-colors"
            onPointerDown={(e) => { e.preventDefault(); addShots(20); }}
          >
            <div className="w-20 h-20 rounded-full border-2 border-amber-400/70 dark:border-amber-500/50 flex items-center justify-center bg-amber-50/60 dark:bg-amber-900/30">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">+20</span>
            </div>
          </button>

          {/* Score badge straddling the border */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="bg-card border-2 border-border rounded-full w-14 h-14 flex items-center justify-center shadow-md">
              <span className="text-2xl font-black tabular-nums text-foreground leading-none">{shotCount}</span>
            </div>
          </div>

          {/* +5 */}
          <button
            className="flex-1 flex flex-col items-center justify-center
              bg-amber-50 dark:bg-amber-950/30
              hover:bg-amber-100 dark:hover:bg-amber-900/40
              active:bg-amber-200 dark:active:bg-amber-900/50
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); addShots(5); }}
          >
            <div className="w-20 h-20 rounded-full border-2 border-amber-300/60 dark:border-amber-600/40 flex items-center justify-center bg-white/40 dark:bg-amber-950/20">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">+5</span>
            </div>
          </button>
        </div>

        {/* Col 2: Bump + Trench — no right border in portrait (it's the last col) */}
        <div className="flex flex-col flex-[5] portrait:border-r-0 landscape:border-r landscape:border-border">
          {/* Bump */}
          <button
            className="relative flex-1 flex flex-col items-center justify-center overflow-hidden
              bg-sky-100 dark:bg-sky-950/50
              hover:bg-sky-200 dark:hover:bg-sky-900/60
              active:bg-sky-300 dark:active:bg-sky-900/70
              border-b border-border transition-colors"
            onPointerDown={(e) => { e.preventDefault(); logEvent("bump"); }}
          >
            <span
              className="absolute font-black select-none leading-none text-sky-400/25 dark:text-sky-400/20 tabular-nums"
              style={{ fontSize: "clamp(5rem, 20vw, 10rem)" }}
            >
              {bumpCount}
            </span>
            <span className="relative text-3xl font-semibold text-sky-800 dark:text-sky-200">Bump</span>
          </button>

          {/* Trench */}
          <button
            className="relative flex-1 flex flex-col items-center justify-center overflow-hidden
              bg-emerald-100 dark:bg-emerald-950/50
              hover:bg-emerald-200 dark:hover:bg-emerald-900/60
              active:bg-emerald-300 dark:active:bg-emerald-900/70
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); logEvent("trench"); }}
          >
            <span
              className="absolute font-black select-none leading-none text-emerald-400/25 dark:text-emerald-400/20 tabular-nums"
              style={{ fontSize: "clamp(5rem, 20vw, 10rem)" }}
            >
              {trenchCount}
            </span>
            <span className="relative text-3xl font-semibold text-emerald-800 dark:text-emerald-200">Trench</span>
          </button>
        </div>

        {/* Col 3: Undo + Next — landscape only */}
        <div className="portrait:hidden landscape:flex flex-col flex-[2]">
          {undoBtn("flex-1 border-b border-border")}
          {nextBtn("flex-1")}
        </div>
      </div>

      {/* Bottom bar: Undo | Next — portrait only */}
      <div className="portrait:flex landscape:hidden h-20 shrink-0 border-t border-border">
        {undoBtn("flex-1 border-r border-border")}
        {nextBtn("flex-1")}
      </div>
    </div>
  );

  // ── Frame 2 ─────────────────────────────────────────────────────────────
  const Frame2 = () => (
    <div className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background">
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Field image */}
        <div
          ref={imgContainerRef}
          className="relative flex-1 overflow-hidden cursor-crosshair"
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
        >
          <img
            ref={imgRef}
            src={fieldImage}
            alt="Field"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
            onLoad={updateImgBounds}
          />

          {/* Primary dot — positioned relative to actual image rect */}
          {primaryPos && toContainerPx(primaryPos) && (() => {
            const px = toContainerPx(primaryPos)!;
            return (
              <div
                className="absolute w-8 h-8 rounded-full bg-amber-400 border-2 border-amber-700 shadow-lg cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
                style={{ left: px.left, top: px.top }}
                onPointerDown={(e) => handleDotPointerDown(e, "primary")}
              />
            );
          })()}

          {/* Secondary dot */}
          {secondaryPos && toContainerPx(secondaryPos) && (() => {
            const px = toContainerPx(secondaryPos)!;
            return (
              <div
                className="absolute w-8 h-8 rounded-full bg-violet-400 border-2 border-violet-700 shadow-lg cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
                style={{ left: px.left, top: px.top }}
                onPointerDown={(e) => handleDotPointerDown(e, "secondary")}
              />
            );
          })()}

          {/* Legend */}
          <div className="absolute bottom-2 left-2 text-xs bg-card/80 border border-border rounded-md px-2 py-1 pointer-events-none flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="text-muted-foreground">Primary</span>
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
            <span className="text-muted-foreground">Secondary</span>
          </div>
        </div>

        {/* Sidebar: Back | Undo | Finish — landscape only */}
        <div className="portrait:hidden landscape:flex w-24 flex-col border-l border-border shrink-0">
          {backBtn("flex-1 border-b border-border")}
          {undoBtn("flex-1 border-b border-border")}
          {finishBtn("flex-1")}
        </div>
      </div>

      {/* Bottom bar: Back | Undo | Finish — portrait only */}
      <div className="portrait:flex landscape:hidden h-20 shrink-0 border-t border-border">
        {backBtn("flex-1 border-r border-border")}
        {undoBtn("flex-1 border-r border-border")}
        {finishBtn("flex-1")}
      </div>
    </div>
  );

  return (
    <>
      {frame === 1 ? <Frame1 /> : <Frame2 />}
      <StartMatchOverlay
        show={!hasStarted}
        onStartMatch={startMatch}
        matchNumber={match_number}
        role={role}
      />
    </>
  );
}
