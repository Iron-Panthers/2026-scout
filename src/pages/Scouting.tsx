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
    buttonId: string;
  } | null>(null);

  // Button press tracking for visual feedback (only for animation)
  const [pressedButtonId, setPressedButtonId] = useState<string | null>(null);

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

  // Check if we're scouting a blue alliance team (rotate buttons 180° for blue side)
  const isBlueAlliance = role.toLowerCase().startsWith("blue");

  // Helper to rotate button positions 180° (flip on both x and y axes)
  const rotateButton180 = (btn: ActionButton): ActionButton => {
    if (!isBlueAlliance) return btn;
    return {
      ...btn,
      x: 1 - btn.x - btn.w,
      y: 1 - btn.y - btn.h,
    };
  };

  // Define action buttons directly in TypeScript (positions for red alliance)
  const baseActionButtons: ActionButton[] = [
    {
      id: "depot-intake",
      title: "Depot",
      x: 0.05,
      y: 0.235,
      w: 0.08,
      h: 0.11,
      color: "#ff5555",
      type: "direct",
      action: "recordDepotIntake",
      repeatable: false,
    },
    {
      id: "climb-modal",
      title: "Climb",
      x: 0.05,
      y: 0.45,
      w: 0.08,
      h: 0.155,
      color: "#facc15",
      type: "modal",
      action: "recordClimb",
      options: [
        {
          label: "Climb L3",
          payload: "L3",
          color: "#facc15",
        },
        {
          label: "Climb L2",
          payload: "L2",
          color: "#facc15",
        },
        {
          label: "Climb L1",
          payload: "L1",
          color: "#facc15",
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
      color: "#fb923c",
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
      color: "#fb923c",
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
      color: "#fb923c",
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
      color: "#fb923c",
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
      color: "#22d3ee",
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
      color: "#22d3ee",
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
      color: "#22d3ee",
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
      color: "#22d3ee",
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
      color: "#ff7849",
      type: "modal",
      action: "recordOutpost",
      options: [
        {
          label: "Intake from Outpost",
          payload: "intake",
          color: "#ff7849",
        },
        {
          label: "Feed Outpost",
          payload: "feed",
          color: "#ff7849",
        },
      ],
    },
  ];

  // Apply 180° rotation for blue alliance scouting
  const actionButtons = baseActionButtons.map(rotateButton180);

  // Derive button press counts from actual state.events
  // This ensures counts sync with undo/redo operations
  const getButtonPressCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};

    // Map button IDs to their event type patterns
    const buttonEventMap: Record<string, string | RegExp> = {
      "depot-intake": "depotIntakes",
      "climb-modal": /^climb(L1|L2|L3)$/,
      "bump-left-home": "bumpLeftHome",
      "bump-right-home": "bumpRightHome",
      "bump-left-away": "bumpLeftAway",
      "bump-right-away": "bumpRightAway",
      "trench-left-home": "trenchLeftHome",
      "trench-right-home": "trenchRightHome",
      "trench-left-away": "trenchLeftAway",
      "trench-right-away": "trenchRightAway",
      "outpost-modal": /^outpost(Intake|Feed)$/,
    };

    // Count events for each button
    Object.entries(buttonEventMap).forEach(([buttonId, pattern]) => {
      if (typeof pattern === "string") {
        counts[buttonId] = state.events.filter(e => e.type === pattern).length;
      } else {
        counts[buttonId] = state.events.filter(e => pattern.test(e.type)).length;
      }
    });

    return counts;
  };

  const buttonPressCounts = getButtonPressCounts();

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
    // Check if non-repeatable button has already been pressed
    if (button.repeatable === false && buttonPressCounts[button.id] > 0) {
      return; // Don't allow clicking non-repeatable buttons again
    }

    if (button.type === "direct" && button.action) {
      // Show press animation
      setPressedButtonId(button.id);
      setTimeout(() => setPressedButtonId(null), 200);

      handleAction(button.action, button.payload);
    } else if (button.type === "modal" && button.options && button.action) {
      // Check if non-repeatable modal has already been used
      if (button.repeatable === false && buttonPressCounts[button.id] > 0) {
        return;
      }

      setModalConfig({
        title: button.title,
        action: button.action,
        options: button.options,
        buttonId: button.id,
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
      <div className="fixed bottom-1 right-1 md:bottom-2 md:right-2 lg:bottom-3 lg:right-3 z-50 flex flex-col items-center gap-0.5 md:gap-1">
        {/* Timer Display */}
        <div className="flex flex-col items-center mb-0.5 md:mb-1">
          <span className="text-[9px] md:text-xs lg:text-sm text-white font-bold leading-none mb-0.5 md:mb-1">
            {PHASE_DISPLAY_NAMES[currentPhase]}
          </span>
          <div
            className="relative w-11 h-11 md:w-16 md:h-16 lg:w-20 lg:h-20 xl:w-24 xl:h-24 flex items-center justify-center rounded-full border-2 md:border-3 lg:border-4 bg-black"
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
              className="absolute text-xs md:text-base lg:text-lg xl:text-xl font-bold text-white"
              style={{
                fontFamily:
                  'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(phaseTimeRemaining)}
            </span>
          </div>
        </div>
      </div>
      {/* Fixed Orientation Menu */}
      <div className="fixed top-1 right-1 md:top-2 md:right-2 lg:top-3 lg:right-3 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 xl:h-14 xl:w-14 p-0">
              <MoreVertical className="h-3.5 w-3.5 md:h-5 md:w-5 lg:h-6 lg:w-6 xl:h-7 xl:w-7" />
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
      <aside className="w-16 md:w-24 lg:w-28 xl:w-32 border-r border-border bg-card p-1 md:p-2 lg:p-3 flex flex-col gap-1 md:gap-2 lg:gap-3">
        <Button
          variant={selected === "1x" ? "default" : "outline"}
          className="w-full flex-1 text-sm md:text-lg lg:text-xl xl:text-2xl font-bold px-0"
          onClick={() => setSelected("1x")}
        >
          1x
        </Button>
        <Button
          variant={selected === "5x" ? "default" : "outline"}
          className="w-full flex-1 text-sm md:text-lg lg:text-xl xl:text-2xl font-bold px-0"
          onClick={() => setSelected("5x")}
        >
          5x
        </Button>
        <Button
          variant={selected === "10x" ? "default" : "outline"}
          className="w-full flex-1 text-xs md:text-lg lg:text-xl xl:text-2xl font-bold px-0"
          onClick={() => setSelected("10x")}
        >
          10x
        </Button>
        <Button
          variant={selected === "action" ? "default" : "outline"}
          className="w-full flex-1 text-[10px] md:text-base lg:text-lg xl:text-xl font-bold px-0 leading-tight"
          onClick={() => setSelected("action")}
        >
          ACT
        </Button>
        <Button
          variant="outline"
          className="w-full h-9 md:h-12 lg:h-14 xl:h-16 p-0"
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
        >
          <Undo className="h-4 w-4 md:h-6 md:w-6 lg:h-7 lg:w-7 xl:h-8 xl:w-8" />
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
        buttonPressCounts={buttonPressCounts}
        pressedButtonId={pressedButtonId}
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
