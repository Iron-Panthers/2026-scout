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

  console.log("Scouting page loaded:", {
    match_id,
    role,
    event_code,
    match_number,
    team_number,
    match_type
  });

  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    action: string;
    options: ModalOption[];
  } | null>(null);

  // Use the reducer hook instead of useState
  const { state, set, increment, undo, canUndo, setPhase, currentPhase } =
    useScoutingReducer(match_id || "", role || "", event_code, match_number, team_number);

  // Continuous match timer
  const {
    hasStarted,
    phaseTimeRemaining,
    phaseDuration,
    phaseProgress,
    startMatch: startMatchTimer,
    resetMatch,
  } = useMatchTimer(currentPhase);

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

  // Log the initialized state
  console.log("Scouting state initialized:", {
    matchId: state.matchId,
    event_code: state.event_code,
    match_number: state.match_number,
    role: state.role,
  });

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
  const phaseAbbr: Record<Phase, string> = {
    auto: "A",
    "transition-shift": "TS",
    phase1: "P1",
    phase2: "P2",
    phase3: "P3",
    phase4: "P4",
    endgame: "EG",
  };

  const currentPhaseIndex = phases.indexOf(currentPhase);

  // Get next phase name for overlay
  const nextPhaseName =
    currentPhaseIndex < phases.length - 1
      ? PHASE_DISPLAY_NAMES[phases[currentPhaseIndex + 1]]
      : null;

  const goToNextPhase = () => {
    if (currentPhaseIndex < phases.length - 1) {
      setPhase(phases[currentPhaseIndex + 1]);
    }
  };
  const goToPrevPhase = () => {
    if (currentPhaseIndex > 0) {
      setPhase(phases[currentPhaseIndex - 1]);
    }
  };

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
      color: "#ef4444",
      type: "modal",
      action: "recordClimb",
      options: [
        {
          label: "Climb L3",
          payload: "L3",
          color: "#ef4444",
        },
        {
          label: "Climb L2",
          payload: "L2",
          color: "#ef4444",
        },
        {
          label: "Climb L1",
          payload: "L1",
          color: "#ef4444",
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
    console.log(state);
    switch (actionName) {
      case "recordDepotIntake":
        increment(`counters.{phase}.depotIntakes`);
        console.log("intake depot");
        break;
      case "recordClimb":
        increment(`counters.{phase}.climb${payload}`);
        console.log(`climb recorded: ${payload}`);
        break;
      case "recordTrench":
        increment(`counters.{phase}.trenchIntakes`);
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

    set("shots.{phase}", [...state.shots[currentPhase], ...newShots]);
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

        {/* Phase Shifter */}
        <Button
          variant="outline"
          size="sm"
          onClick={goToNextPhase}
          disabled={currentPhaseIndex === phases.length - 1}
          className="h-9 w-9 p-0 text-base"
          style={{
            opacity: currentPhaseIndex === phases.length - 1 ? 0.5 : 1,
          }}
        >
          &#8593;
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={currentPhaseIndex === phases.length - 1}
          className="h-9 w-9 p-0 text-[10px] font-bold"
        >
          {phaseAbbr[currentPhase]}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goToPrevPhase}
          disabled={currentPhaseIndex === 0}
          className="h-9 w-9 p-0 text-base"
          style={{
            opacity: currentPhaseIndex === 0 ? 0.5 : 1,
          }}
        >
          &#8595;
        </Button>
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
            <DropdownMenuItem
              onClick={resetMatch}
              className="text-orange-600 dark:text-orange-400"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Match Timer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                // Encode state as base64url
                const json = JSON.stringify(state);
                const base64url = btoa(
                  encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
                    String.fromCharCode(parseInt(p1, 16))
                  )
                )
                  .replace(/\+/g, "-")
                  .replace(/\//g, "_")
                  .replace(/=+$/, "");
                navigate(`/review/${base64url}`);
              }}
            >
              Review &amp; Submit
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
        shots={state.shots[currentPhase]}
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
