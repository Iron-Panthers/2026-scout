import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoreVertical, Undo } from "lucide-react";
// import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionButton, ModalOption } from "@/types/actionButtons";
import ActionModal from "@/components/scouting/ActionModal";
import ScoutingCanvas from "@/components/scouting/ScoutingCanvas";
import { useScoutingReducer } from "@/lib/useScoutingReducer";
import type { Phase } from "@/lib/ScoutingReducer";
// import type { ScoutingData } from "@/lib/ScoutingReducer";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Scouting() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Read all parameters from query string
  const match_id = searchParams.get("match_id") || "";
  const role = searchParams.get("role") || "";
  const event_id = searchParams.get("event_id") || "";
  const match_number = parseInt(searchParams.get("match_number") || "0");

  console.log("Scouting page loaded:", { match_id, role, event_id, match_number });

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
    useScoutingReducer(match_id || "", role || "", event_id, match_number);

  // Log the initialized state
  console.log("Scouting state initialized:", {
    matchId: state.matchId,
    event_id: state.event_id,
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
        increment("counters.{path}.depotIntakes");
        console.log("intake depot");
        break;
      case "recordClimb":
        increment(`counters.climb${payload}`);
        console.log(`climb recorded: ${payload}`);
        break;
      case "recordTrench":
        increment("counters.trenchIntakes");
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
    const newShots = Array.from({ length: shotCount }, () => ({
      x,
      y,
      timestamp,
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
      {/* Phase Shifter - Bottom Right */}
      <div className="fixed bottom-2 right-2 z-50 flex flex-col items-center">
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextPhase}
          disabled={currentPhaseIndex === phases.length - 1}
          style={{
            opacity: currentPhaseIndex === phases.length - 1 ? 0.5 : 1,
            marginBottom: 4,
          }}
        >
          &#8593;
        </Button>
        <Button
          variant="default"
          size="icon"
          disabled={currentPhaseIndex === phases.length - 1}
          style={{
            marginTop: 4,
          }}
        >
          {phaseAbbr[currentPhase]}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevPhase}
          disabled={currentPhaseIndex === 0}
          style={{
            opacity: currentPhaseIndex === 0 ? 0.5 : 1,
            marginTop: 4,
          }}
        >
          &#8595;
        </Button>
      </div>
      {/* Fixed Orientation Menu */}
      <div className="fixed top-2 right-2 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreVertical className="h-4 w-4" />
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
      <aside className="w-32 border-r border-border bg-card p-2 flex flex-col gap-2">
        <Button
          variant={selected === "1x" ? "default" : "outline"}
          className="w-full flex-1"
          onClick={() => setSelected("1x")}
        >
          1x
        </Button>
        <Button
          variant={selected === "5x" ? "default" : "outline"}
          className="w-full flex-1"
          onClick={() => setSelected("5x")}
        >
          5x
        </Button>
        <Button
          variant={selected === "10x" ? "default" : "outline"}
          className="w-full flex-1"
          onClick={() => setSelected("10x")}
        >
          10x
        </Button>
        <Button
          variant={selected === "action" ? "default" : "outline"}
          className="w-full flex-1"
          onClick={() => setSelected("action")}
        >
          Action
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={undo}
          disabled={!canUndo}
        >
          <Undo className="h-4 w-4 mr-2" />
          Undo
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
    </div>
  );
}
