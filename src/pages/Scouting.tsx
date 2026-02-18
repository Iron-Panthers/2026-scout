import { useState, useRef, useCallback } from "react";
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

  // Dot drag state
  const draggingDot = useRef<"primary" | "secondary" | null>(null);
  const pendingDotPos = useRef<{ x: number; y: number } | null>(null);
  const hasMoved = useRef(false);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const [dotPreview, setDotPreview] = useState<{
    which: "primary" | "secondary";
    x: number;
    y: number;
  } | null>(null);

  // Derived counts
  const shotCount = state.shots.length;
  const bumpCount = state.events.filter((e) => e.name === "bump").length;
  const trenchCount = state.events.filter((e) => e.name === "trench").length;

  const addShots = (count: number) => {
    const ts = state.matchStartTime
      ? (Date.now() - state.matchStartTime) / 1000
      : 0;
    set("shots", [...state.shots, ...Array(count).fill(ts)]);
  };

  const handleFinish = async () => {
    const { compressState } = await import("@/lib/stateCompression");
    navigate(`/review/${compressState(state)}`);
  };

  const getNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = imgContainerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0.5, y: 0.5 };
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      return { x, y };
    },
    []
  );

  const handleDotPointerDown = (
    e: React.PointerEvent,
    which: "primary" | "secondary"
  ) => {
    e.stopPropagation();
    draggingDot.current = which;
    hasMoved.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (draggingDot.current === null) return;
    hasMoved.current = true;
    const pos = getNormalized(e.clientX, e.clientY);
    pendingDotPos.current = pos;
    setDotPreview({ which: draggingDot.current, x: pos.x, y: pos.y });
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (draggingDot.current !== null) {
      if (hasMoved.current && pendingDotPos.current) {
        const key =
          draggingDot.current === "primary"
            ? "primaryShotPosition"
            : "secondaryShotPosition";
        set(key, pendingDotPos.current);
      }
      draggingDot.current = null;
      pendingDotPos.current = null;
      setDotPreview(null);
    } else {
      const pos = getNormalized(e.clientX, e.clientY);
      if (state.primaryShotPosition === null) {
        set("primaryShotPosition", pos);
      } else if (state.secondaryShotPosition === null) {
        set("secondaryShotPosition", pos);
      }
    }
  };

  const headerLabel = `Team ${team_number || "?"} — Match ${match_number || "?"}`;

  const primaryPos =
    dotPreview?.which === "primary" ? dotPreview : state.primaryShotPosition;
  const secondaryPos =
    dotPreview?.which === "secondary" ? dotPreview : state.secondaryShotPosition;

  const Frame1 = () => (
    <div className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background">
      {/* Header */}
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

      {/* Button grid */}
      <div className="flex flex-1 overflow-hidden">

        {/* Col 1: Shot buttons with score badge */}
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

        {/* Col 2: Bump + Trench */}
        <div className="flex flex-col flex-[5] border-r border-border">
          {/* Bump */}
          <button
            className="relative flex-1 flex flex-col items-center justify-center overflow-hidden
              bg-sky-100 dark:bg-sky-950/50
              hover:bg-sky-200 dark:hover:bg-sky-900/60
              active:bg-sky-300 dark:active:bg-sky-900/70
              border-b border-border transition-colors"
            onPointerDown={(e) => { e.preventDefault(); logEvent("bump"); }}
          >
            {/* Ghost count */}
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
            {/* Ghost count */}
            <span
              className="absolute font-black select-none leading-none text-emerald-400/25 dark:text-emerald-400/20 tabular-nums"
              style={{ fontSize: "clamp(5rem, 20vw, 10rem)" }}
            >
              {trenchCount}
            </span>
            <span className="relative text-3xl font-semibold text-emerald-800 dark:text-emerald-200">Trench</span>
          </button>
        </div>

        {/* Col 3: Undo + Next */}
        <div className="flex flex-col flex-[2]">
          {/* Undo */}
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-b border-border transition-colors
              ${canUndo
                ? "bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 dark:hover:bg-rose-900/60 active:bg-rose-300 dark:active:bg-rose-900/70 text-rose-700 dark:text-rose-300"
                : "bg-muted/40 text-muted-foreground/40 pointer-events-none"
              }`}
            onPointerDown={(e) => { e.preventDefault(); if (canUndo) undo(); }}
          >
            <Undo2 className="w-6 h-6" />
            <span className="text-xs font-medium">Undo</span>
          </button>

          {/* Next */}
          <button
            className="flex-1 flex flex-col items-center justify-center gap-1
              bg-violet-100 dark:bg-violet-950/50
              hover:bg-violet-200 dark:hover:bg-violet-900/60
              active:bg-violet-300 dark:active:bg-violet-900/70
              text-violet-700 dark:text-violet-300
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); setFrame(2); }}
          >
            <ArrowRight className="w-6 h-6" />
            <span className="text-xs font-medium">Next</span>
          </button>
        </div>
      </div>
    </div>
  );

  const Frame2 = () => (
    <div className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background">
      {/* Header */}
      <div className="h-12 border-b border-border flex items-center px-4 shrink-0 bg-card gap-2">
        <span className="font-semibold text-sm">{headerLabel}</span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{role}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Field image area */}
        <div
          ref={imgContainerRef}
          className="relative flex-1 overflow-hidden cursor-crosshair"
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
        >
          <img
            src={fieldImage}
            alt="Field"
            className="w-full h-full object-contain pointer-events-none"
            draggable={false}
          />

          {/* Primary dot */}
          {primaryPos && (
            <div
              className="absolute w-8 h-8 rounded-full bg-amber-400 border-2 border-amber-700 shadow-lg cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${primaryPos.x * 100}%`, top: `${primaryPos.y * 100}%` }}
              onPointerDown={(e) => handleDotPointerDown(e, "primary")}
            />
          )}

          {/* Secondary dot */}
          {secondaryPos && (
            <div
              className="absolute w-8 h-8 rounded-full bg-violet-400 border-2 border-violet-700 shadow-lg cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${secondaryPos.x * 100}%`, top: `${secondaryPos.y * 100}%` }}
              onPointerDown={(e) => handleDotPointerDown(e, "secondary")}
            />
          )}

          {/* Legend */}
          <div className="absolute bottom-2 left-2 text-xs bg-card/80 border border-border rounded-md px-2 py-1 pointer-events-none flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span className="text-muted-foreground">Primary</span>
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />
            <span className="text-muted-foreground">Secondary</span>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-24 flex flex-col border-l border-border shrink-0">
          {/* Back */}
          <button
            className="flex-1 flex flex-col items-center justify-center gap-1 border-b border-border
              bg-amber-100 dark:bg-amber-950/50
              hover:bg-amber-200 dark:hover:bg-amber-900/60
              active:bg-amber-300 dark:active:bg-amber-900/70
              text-amber-700 dark:text-amber-300
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); setFrame(1); }}
          >
            <ArrowLeft className="w-6 h-6" />
            <span className="text-xs font-medium">Back</span>
          </button>

          {/* Undo */}
          <button
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-b border-border transition-colors
              ${canUndo
                ? "bg-rose-100 dark:bg-rose-950/50 hover:bg-rose-200 dark:hover:bg-rose-900/60 active:bg-rose-300 dark:active:bg-rose-900/70 text-rose-700 dark:text-rose-300"
                : "bg-muted/40 text-muted-foreground/40 pointer-events-none"
              }`}
            onPointerDown={(e) => { e.preventDefault(); if (canUndo) undo(); }}
          >
            <Undo2 className="w-6 h-6" />
            <span className="text-xs font-medium">Undo</span>
          </button>

          {/* Finish */}
          <button
            className="flex-1 flex flex-col items-center justify-center gap-1
              bg-violet-100 dark:bg-violet-950/50
              hover:bg-violet-200 dark:hover:bg-violet-900/60
              active:bg-violet-300 dark:active:bg-violet-900/70
              text-violet-700 dark:text-violet-300
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); handleFinish(); }}
          >
            <Check className="w-6 h-6" />
            <span className="text-xs font-medium">Finish</span>
          </button>
        </div>
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
