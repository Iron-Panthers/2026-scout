import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MoreVertical, Undo, RotateCcw } from "lucide-react";
// import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ActionButton, ModalOption } from "@/types/actionButtons";
import ActionModal from "@/components/scouting/ActionModal";
import ScoutingCanvas from "@/components/scouting/ScoutingCanvas";
import StartMatchOverlay from "@/components/scouting/StartMatchOverlay";
import PhaseTransitionOverlay from "@/components/scouting/PhaseTransitionOverlay";
import { useScoutingReducer } from "@/lib/useScoutingReducer";
import { useMatchTimer } from "@/lib/useMatchTimer";
import type { Phase } from "@/lib/ScoutingReducer";
// import type { ScoutingData } from "@/lib/ScoutingReducer";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Scouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read all parameters from query string
  const match_id = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || "";
  const event_code = searchParams.get("event_code") || "";
  const match_number = parseInt(searchParams.get("match_number") || "0");
  const team_number = parseInt(searchParams.get("team_number") || "0");
  const match_type = parseInt(searchParams.get("type") || "qual");

  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    action: string;
    options: ModalOption[];
  } | null>(null);

  // Use the reducer hook instead of useState
  const { state, set, logEvent, undo, canUndo } = useScoutingReducer(
    match_id || "",
    role || "",
    event_code,
    match_number,
    team_number
  );

  // Continuous match timer
  const {
    hasStarted,
    currentPhase,
    phaseTimeRemaining,
    phaseDuration,
    phaseProgress,
    startMatch: startMatchTimer,
    resetMatch,
    skipToPhase,
  } = useMatchTimer();

  // Wrap startMatch to also record the match start time in scouting state
  const startMatch = () => {
    const now = Date.now();
    set("matchStartTime", now);
    startMatchTimer();
  };

  // Track phase transitions for overlay
  const [showPhaseTransition, setShowPhaseTransition] = useState(false);
  const prevPhaseTimeRef = useRef(phaseTimeRemaining);
  const prevPhaseRef = useRef(currentPhase);

  // Detect when phase time hits 0 to show transition overlay
  useEffect(() => {
    if (
      hasStarted &&
      prevPhaseTimeRef.current > 0 &&
      phaseTimeRemaining === 0
    ) {
      setShowPhaseTransition(true);
      // Auto-dismiss after 3 seconds
      const timeout = setTimeout(() => {
        setShowPhaseTransition(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    prevPhaseTimeRef.current = phaseTimeRemaining;
  }, [phaseTimeRemaining, hasStarted]);

  // Dismiss overlay when user manually changes phase
  useEffect(() => {
    if (prevPhaseRef.current !== currentPhase) {
      setShowPhaseTransition(false);
      prevPhaseRef.current = currentPhase;
    }
  }, [currentPhase]);

  // Dismiss overlay when match is reset
  useEffect(() => {
    if (!hasStarted) {
      setShowPhaseTransition(false);
    }
  }, [hasStarted]);

  // Format seconds as M:SS (whole seconds only)
  const formatTime = (seconds: number) => {
    const wholeSeconds = Math.floor(seconds);
    const m = Math.floor(wholeSeconds / 60);
    const s = wholeSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Phase names for display
  const PHASE_DISPLAY_NAMES: Record<Phase, string> = {
    auto: "Auto",
    "transition-shift": "T Shift",
    phase1: "Shift 1",
    phase2: "Shift 2",
    phase3: "Shift 3",
    phase4: "Shift 4",
    endgame: "Endgame",
  };

  // All phases in order and abbreviations
  const phases: Phase[] = [
    "auto",
    "transition-shift",
    "phase1",
    "phase2",
    "phase3",
    "phase4",
    "endgame",
  ];

  const currentPhaseIndex = phases.indexOf(currentPhase);

  // Get next phase name for overlay
  const nextPhaseName =
    currentPhaseIndex < phases.length - 1
      ? PHASE_DISPLAY_NAMES[phases[currentPhaseIndex + 1]]
      : null;

  // Phase navigation removed - timer auto-advances phases

  // Define action buttons directly in TypeScript
  const actionButtons: ActionButton[] = [
    {
      id: "depot-intake",
      title: "Depot",
      x: 0.05,
      y: 0.235,
      w: 0.08,
      h: 0.11,
      color: "#ef4444",
      type: "direct",
      action: "recordDepotIntake",
    },
    {
      id: "climb-modal",
      title: "Climb",
      x: 0.05,
      y: 0.45,
      w: 0.08,
      h: 0.155,
      color: "#ca8a04",
      type: "modal",
      action: "recordClimb",
      options: [
        {
          label: "Climb L3",
          payload: "L3",
          color: "#ca8a04",
        },
        {
          label: "Climb L2",
          payload: "L2",
          color: "#ca8a04",
        },
        {
          label: "Climb L1",
          payload: "L1",
          color: "#ca8a04",
        },
      ],
    },
    // Bump buttons (4 across field) - Brown/tan color
    {
      id: "bump-left-home",
      title: "Bump",
      x: 0.27,
      y: 0.24,
      w: 0.065,
      h: 0.18,
      color: "#f59e0b",
      type: "direct",
      action: "recordBumpLeftHome",
    },
    {
      id: "bump-right-home",
      title: "Bump",
      x: 0.27,
      y: 0.58,
      w: 0.065,
      h: 0.18,
      color: "#f59e0b",
      type: "direct",
      action: "recordBumpRightHome",
    },
    {
      id: "bump-left-away",
      title: "Bump",
      x: 0.67,
      y: 0.24,
      w: 0.065,
      h: 0.18,
      color: "#f59e0b",
      type: "direct",
      action: "recordBumpLeftAway",
    },
    {
      id: "bump-right-away",
      title: "Bump",
      x: 0.67,
      y: 0.58,
      w: 0.065,
      h: 0.18,
      color: "#f59e0b",
      type: "direct",
      action: "recordBumpRightAway",
    },
    // Trench buttons (4 across field) - Cyan/blue color
    {
      id: "trench-left-home",
      title: "Trench",
      x: 0.27,
      y: 0.06,
      w: 0.065,
      h: 0.15,
      color: "#06b6d4",
      type: "direct",
      action: "recordTrenchLeftHome",
    },
    {
      id: "trench-right-home",
      title: "Trench",
      x: 0.27,
      y: 0.79,
      w: 0.065,
      h: 0.15,
      color: "#06b6d4",
      type: "direct",
      action: "recordTrenchRightHome",
    },
    {
      id: "trench-left-away",
      title: "Trench",
      x: 0.67,
      y: 0.06,
      w: 0.065,
      h: 0.15,
      color: "#06b6d4",
      type: "direct",
      action: "recordTrenchLeftAway",
    },
    {
      id: "trench-right-away",
      title: "Trench",
      x: 0.67,
      y: 0.79,
      w: 0.065,
      h: 0.15,
      color: "#06b6d4",
      type: "direct",
      action: "recordTrenchRightAway",
    },
    // Outpost modal (left side of field) - Orange/amber color
    {
      id: "outpost-modal",
      title: "Outpost",
      x: 0.05,
      y: 0.8,
      w: 0.08,
      h: 0.12,
      color: "#f97316",
      type: "modal",
      action: "recordOutpost",
      options: [
        {
          label: "Intake from Outpost",
          payload: "intake",
          color: "#f97316",
        },
        {
          label: "Feed Outpost",
          payload: "feed",
          color: "#f97316",
        },
      ],
    },
  ];

  // Action handlers defined inline
  const handleAction = (
    actionName: string,
    payload?: string
    // button?: ActionButton
  ) => {
    switch (actionName) {
      case "recordDepotIntake":
        logEvent("depotIntakes");
        break;
      case "recordClimb":
        logEvent(`climb${payload}`);
        break;
      // Bump events
      case "recordBumpLeftHome":
        logEvent("bumpLeftHome");
        break;
      case "recordBumpRightHome":
        logEvent("bumpRightHome");
        break;
      case "recordBumpLeftAway":
        logEvent("bumpLeftAway");
        break;
      case "recordBumpRightAway":
        logEvent("bumpRightAway");
        break;
      // Trench events
      case "recordTrenchLeftHome":
        logEvent("trenchLeftHome");
        break;
      case "recordTrenchRightHome":
        logEvent("trenchRightHome");
        break;
      case "recordTrenchLeftAway":
        logEvent("trenchLeftAway");
        break;
      case "recordTrenchRightAway":
        logEvent("trenchRightAway");
        break;
      // Outpost events
      case "recordOutpost":
        logEvent(
          `outpost${payload?.charAt(0).toUpperCase()}${payload?.slice(1)}`
        );
        break;
      default:
        console.warn(`Action handler not found: ${actionName}`);
    }
  };

  const handleButtonClick = (button: ActionButton) => {
    if (button.type === "direct" && button.action) {
      handleAction(button.action, button.payload);
    } else if (button.type === "modal" && button.options && button.action) {
      setModalConfig({
        title: button.title,
        action: button.action,
        options: button.options,
      });
      setModalOpen(true);
    }
  };

  const handleModalOptionSelect = (option: ModalOption) => {
    if (modalConfig?.action) {
      handleAction(modalConfig.action, option.payload);
    }
  };

  const handleShotClick = (x: number, y: number, timestamp: number) => {
    const shotCount = selected === "1x" ? 1 : selected === "5x" ? 5 : 10;
    // Convert absolute timestamp to seconds into the match
    const relativeTimestamp = state.matchStartTime
      ? (timestamp - state.matchStartTime) / 1000
      : timestamp;
    const newShots = Array.from({ length: shotCount }, () => ({
      x,
      y,
      timestamp: relativeTimestamp,
    }));

    set("shots", [...state.shots, ...newShots]);
  };

  const getShotMultiplier = (): number => {
    if (selected === "1x") return 1;
    if (selected === "5x") return 5;
    if (selected === "10x") return 10;
    return 0;
  };

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden relative">
      {/* Phase Timer & Shifter - Bottom Right */}
      <div className="fixed bottom-1 right-1 z-50 flex flex-col items-center gap-0.5">
        {/* Timer Display */}
        <div className="flex flex-col items-center mb-0.5">
          <span className="text-[9px] text-white font-bold leading-none mb-0.5">
            {PHASE_DISPLAY_NAMES[currentPhase]}
          </span>
          <div
            className="relative w-11 h-11 flex items-center justify-center rounded-full border-2 bg-black"
            style={{
              borderColor:
                phaseTimeRemaining <= 5 && phaseTimeRemaining > 0 && hasStarted
                  ? "#ef4444"
                  : phaseProgress < 0.5
                  ? "#22c55e"
                  : phaseProgress < 0.8
                  ? "#eab308"
                  : "#ef4444",
              background: `conic-gradient(${
                phaseProgress < 0.5
                  ? "#22c55e"
                  : phaseProgress < 0.8
                  ? "#eab308"
                  : "#ef4444"
              } ${phaseProgress * 360}deg, black ${phaseProgress * 360}deg)`,
            }}
          >
            <span
              className="absolute text-xs font-bold text-white"
              style={{
                fontFamily:
                  'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
                fontSize: "0.75rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(phaseTimeRemaining)}
            </span>
          </div>
        </div>
      </div>
      {/* Fixed Orientation Menu */}
      <div className="fixed top-1 right-1 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Review & Submit */}
            <DropdownMenuItem
              onClick={async () => {
                // Compress and encode state for smaller URLs
                const { compressState } = await import(
                  "@/lib/stateCompression"
                );
                const compressed = compressState(state);
                navigate(`/review/${compressed}`);
              }}
            >
              Review &amp; Submit
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {/* Orientation Options */}
            <DropdownMenuItem onClick={() => setOrientation(0)}>
              0° (Default)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrientation(90)}>
              90° (Right)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrientation(180)}>
              180° (Flipped)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrientation(270)}>
              270° (Left)
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {/* Reset Timer */}
            <DropdownMenuItem onClick={resetMatch}>
              Reset Match Timer
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {/* Skip to Phase */}
            <DropdownMenuItem onClick={() => skipToPhase("auto")}>
              Skip to Auto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("transition-shift")}>
              Skip to Transition
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("phase1")}>
              Skip to Phase 1
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("phase2")}>
              Skip to Phase 2
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("phase3")}>
              Skip to Phase 3
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("phase4")}>
              Skip to Phase 4
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => skipToPhase("endgame")}>
              Skip to Endgame
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sidebar */}
      <aside className="w-16 border-r border-border bg-card p-1 flex flex-col gap-1">
        <Button
          variant={selected === "1x" ? "default" : "outline"}
          className="w-full flex-1 text-sm font-bold px-0"
          onClick={() => setSelected("1x")}
        >
          1x
        </Button>
        <Button
          variant={selected === "5x" ? "default" : "outline"}
          className="w-full flex-1 text-sm font-bold px-0"
          onClick={() => setSelected("5x")}
        >
          5x
        </Button>
        <Button
          variant={selected === "10x" ? "default" : "outline"}
          className="w-full flex-1 text-xs font-bold px-0"
          onClick={() => setSelected("10x")}
        >
          10x
        </Button>
        <Button
          variant={selected === "action" ? "default" : "outline"}
          className="w-full flex-1 text-[10px] font-bold px-0 leading-tight"
          onClick={() => setSelected("action")}
        >
          ACT
        </Button>
        <Button
          variant="outline"
          className="w-full h-9 p-0"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo className="h-4 w-4" />
        </Button>
      </aside>

      {/* Canvas Area */}
      <ScoutingCanvas
        orientation={orientation}
        shots={state.shots}
        actionButtons={actionButtons}
        showActionButtons={selected === "action"}
        onButtonClick={handleButtonClick}
        onShotClick={handleShotClick}
        shotMultiplier={getShotMultiplier()}
      />

      {/* Modal */}
      <ActionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalConfig?.title || ""}
        options={modalConfig?.options || []}
        onOptionSelect={handleModalOptionSelect}
      />

      {/* Start Match Overlay */}
      <StartMatchOverlay
        show={!hasStarted}
        onStartMatch={startMatch}
        matchNumber={match_number}
        role={role}
      />

      {/* Phase Transition Overlay */}
      <PhaseTransitionOverlay
        show={showPhaseTransition}
        nextPhaseName={nextPhaseName}
      />
    </div>
  );
}
