import { useState, useRef, useEffect } from "react";
import { compressState } from "@/lib/stateCompression";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Undo2, ArrowRight, ArrowLeft, MoreVertical, RotateCcw } from "lucide-react";
import { useScoutingReducer } from "@/lib/useScoutingReducer";
import { useMatchTimer } from "@/lib/useMatchTimer";
import { useSettings } from "@/contexts/SettingsContext";
import StartMatchOverlay from "@/components/scouting/StartMatchOverlay";

export default function Scouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const match_id = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || "";
  const event_code = searchParams.get("event_code") || "";
  const match_number = parseInt(searchParams.get("match_number") || "0");
  const team_number = parseInt(searchParams.get("team_number") || "0");
  const match_type = searchParams.get("match_type") || "qual";
  const isGuest = searchParams.get("g") ?? false;

  const { state, set, undo, canUndo } = useScoutingReducer(
    match_id || "",
    role || "",
    event_code,
    match_number,
    team_number,
    match_type
  );

  const {
    hasStarted,
    startMatch: startMatchTimer,
    resetMatch: resetMatchTimer,
    currentPhase,
    skipToPhase,
    timeRemaining,
    isTransitionPaused,
  } = useMatchTimer();
  const { settings } = useSettings();

  const PHASE_LABELS: Record<string, string> = {
    auto: "Auto",
    "transition-shift": "T-Shift",
    phase1: "Shift 1",
    phase2: "Shift 2",
    phase3: "Shift 3",
    phase4: "Shift 4",
    endgame: "Endgame",
  };

  const PHASE_TIMER_STYLES: Record<string, string> = {
    auto: "border-red-500/40 bg-red-500/10 text-red-500",
    "transition-shift": "border-orange-500/40 bg-orange-500/10 text-orange-500",
    phase1: "border-yellow-400/40 bg-yellow-400/10 text-yellow-400",
    phase2: "border-green-500/40 bg-green-500/10 text-green-500",
    phase3: "border-blue-500/40 bg-blue-500/10 text-blue-500",
    phase4: "border-violet-500/40 bg-violet-500/10 text-violet-500",
    endgame: "border-violet-500/40 bg-violet-500/10 text-violet-500",
  };

  const formatCountdown = (seconds: number) => {
    const totalSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const startMatch = () => {
    set("matchStartTime", Date.now());
    startMatchTimer();
  };

  const [optionsOpen, setOptionsOpen] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────
  const shotCount = state.shots.length;
  const headerLabel = `Team ${team_number || "?"} — Match ${match_number || "?"}`;

  const addShots = (count: number) => {
    const ts = state.matchStartTime ? (Date.now() - state.matchStartTime) / 1000 : 0;
    set("shots", [...state.shots, ...Array(count).fill(ts)]);
  };

  // Keep a stable ref so the keydown handler always has the latest values
  const keybindActionsRef = useRef({ addShots, settings });
  useEffect(() => { keybindActionsRef.current = { addShots, settings }; });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { addShots, settings } = keybindActionsRef.current;
      const key = e.key.toLowerCase();
      if (key === (settings["kb-add1"] ?? "z")) { e.preventDefault(); addShots(1); }
      else if (key === (settings["kb-add5"] ?? "x")) { e.preventDefault(); addShots(5); }
      else if (key === (settings["kb-add20"] ?? "c")) { e.preventDefault(); addShots(10); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleFinish = () => {
    navigate(`/review/${compressState(state)}?type=quant` + (isGuest ? "&g=true" : ""));
  };

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
      onPointerDown={(e) => { e.preventDefault(); handleFinish(); }}
    >
      <ArrowRight className="w-6 h-6" />
      <span className="text-xs font-medium">Next</span>
    </button>
  );

  // ── Options overlay ──────────────────────────────────────────────────────
  const phaseOptions = [
    { phase: "auto" as const, label: "Auto" },
    { phase: "transition-shift" as const, label: "Teleop" },
  ];

  const handleResetMatch = () => {
    resetMatchTimer();
    set("matchStartTime", null);
    setOptionsOpen(false);
  };

  const OptionsOverlay = () => (
    <div className="fixed inset-0 z-50" onPointerDown={() => setOptionsOpen(false)}>
      <div
        className="absolute top-12 right-2 bg-card border border-border rounded-xl shadow-xl w-56 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-rose-600 dark:text-rose-400 border-b border-border"
          onPointerDown={(e) => { e.preventDefault(); navigate(isGuest ? "/guest" : "/dashboard"); }}
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>
        <button
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-amber-600 dark:text-amber-400 border-b border-border"
          onPointerDown={(e) => { e.preventDefault(); handleResetMatch(); }}
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">Reset Match Time</span>
        </button>
        <div className="px-3 py-2.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Skip to Phase</span>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {phaseOptions.map(({ phase, label }) => (
              <button
                key={phase}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors
                  ${currentPhase === phase
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/70 text-foreground"
                  }`}
                onPointerDown={(e) => { e.preventDefault(); skipToPhase(phase); setOptionsOpen(false); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Header (shared) ─────────────────────────────────────────────────────
  const Header = () => (
    <div className="h-12 border-b border-border flex items-center px-4 shrink-0 bg-card gap-2 mt-8 lg:mt-0">
      <span className="font-semibold text-sm">{headerLabel}</span>
      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{role}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Phase</span>
        <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full tabular-nums ${isTransitionPaused ? "animate-pulse border-amber-300 bg-amber-500/20 text-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]" : PHASE_TIMER_STYLES[currentPhase] ?? "bg-primary/10 text-primary border-primary/20"}`}>
          {PHASE_LABELS[currentPhase] ?? currentPhase}
        </span>
        <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full tabular-nums ${isTransitionPaused ? "animate-pulse border-amber-300 bg-amber-500/20 text-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.18)]" : PHASE_TIMER_STYLES[currentPhase] ?? "bg-primary/10 text-primary border-primary/20"}`}>
          {formatCountdown(hasStarted ? timeRemaining : 160)}
        </span>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/80 transition-colors text-muted-foreground ml-1"
          onPointerDown={(e) => { e.preventDefault(); setOptionsOpen((o) => !o); }}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  // ── Frame 1 ─────────────────────────────────────────────────────────────
  const Frame1 = () => (
    <div className="h-screen w-screen flex flex-col select-none touch-none overflow-hidden bg-background">
      {Header()}

      {/* Main button grid */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Col 1: Shot buttons + score badge */}
        <div className="relative flex flex-col flex-[5] border-r border-border">
          {/* +10 */}
          <button
            className="flex-1 flex flex-col items-center justify-center
              bg-amber-100 dark:bg-amber-950/50
              hover:bg-amber-200 dark:hover:bg-amber-900/60
              active:bg-amber-300 dark:active:bg-amber-900/70
              border-b border-border transition-colors"
            onPointerDown={(e) => { e.preventDefault(); addShots(10); }}
          >
            <div className="w-20 h-20 rounded-full border-2 border-amber-400/70 dark:border-amber-500/50 flex items-center justify-center bg-amber-50/60 dark:bg-amber-900/30">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">+10</span>
            </div>
          </button>

          {/* Score badge straddling the border */}
          <div className="absolute left-full top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <div className="bg-card border-2 border-border rounded-full w-14 h-14 flex items-center justify-center shadow-md">
              <span className="text-2xl font-black tabular-nums text-foreground leading-none">{shotCount}</span>
            </div>
          </div>

          {/* +5 */}
          <button
            className="flex-1 flex flex-col items-center justify-center
              bg-emerald-50 dark:bg-emerald-950/30
              hover:bg-emerald-100 dark:hover:bg-emerald-900/40
              active:bg-emerald-200 dark:active:bg-emerald-900/50
              transition-colors"
            onPointerDown={(e) => { e.preventDefault(); addShots(5); }}
          >
            <div className="w-20 h-20 rounded-full border-2 border-emerald-300/60 dark:border-emerald-600/40 flex items-center justify-center bg-white/40 dark:bg-emerald-950/20">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+5</span>
            </div>
          </button>
        </div>

        {/* Col 2: +1 */}
        <div className="flex flex-col flex-[5] portrait:border-r-0 landscape:border-r landscape:border-border">
          {/* +1 */}
          <button
            className="relative flex-1 flex flex-col items-center justify-center overflow-hidden
              bg-sky-100 dark:bg-sky-950/50
              hover:bg-sky-200 dark:hover:bg-sky-900/60
              active:bg-sky-300 dark:active:bg-sky-900/70
              border-b border-border transition-colors"
            onPointerDown={(e) => { e.preventDefault(); addShots(1); }}
          >
            <div className="w-20 h-20 rounded-full border-2 border-sky-400/70 dark:border-sky-500/50 flex items-center justify-center bg-sky-50/60 dark:bg-sky-900/30">
              <span className="text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums">+1</span>
            </div>
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

  return (
    <>
      {Frame1()}
      <StartMatchOverlay
        show={!hasStarted}
        onStartMatch={startMatch}
        matchNumber={match_number}
        teamNumber={team_number}
        role={role}
      />
      {optionsOpen && OptionsOverlay()}
    </>
  );
}
