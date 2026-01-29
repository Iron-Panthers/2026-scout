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
// import type { ScoutingData } from "@/lib/ScoutingReducer";
import { useParams } from "react-router-dom";

export default function Scouting() {
  const { match_id, role } = useParams();
  console.log("Loaded from config: ", match_id, role);

  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    action: string;
    options: ModalOption[];
  } | null>(null);

  // Use the reducer hook instead of useState
  const { state, set, increment, undo, canUndo } = useScoutingReducer(
    match_id || "",
    role || ""
  );

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
        increment("counters.auto.depotIntakes");
        console.log("intake depot");
        break;
      case "recordClimb":
        increment(`counters.auto.climb${payload}`);
        console.log(`climb recorded: ${payload}`);
        break;
      case "recordTrench":
        increment("counters.auto.trenchIntakes");
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

    set("shots.auto", [...state.shots["auto"], ...newShots]);
  };

  const getShotMultiplier = (): number => {
    if (selected === "1x") return 1;
    if (selected === "5x") return 5;
    if (selected === "10x") return 10;
    return 0;
  };

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden relative">
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
        shots={state.shots["auto"]}
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
