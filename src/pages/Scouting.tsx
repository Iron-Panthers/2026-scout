import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionButton, ModalOption } from "@/types/actionButtons";
import ActionModal from "@/components/scouting/ActionModal";
import ScoutingCanvas from "@/components/scouting/ScoutingCanvas";

export default function Scouting() {
  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    title: string;
    options: ModalOption[];
  } | null>(null);

  interface ScoutingData {
    shots: Array<{ x: number; y: number; timestamp: number }>;
    events: Array<{ type: string; timestamp: number; data?: any }>;
    flags: Record<string, boolean>;
    counters: Record<string, number>;
    notes: string[];
  }
  const [scoutingData, setScoutingData] = useState<ScoutingData>({
    shots: [],
    events: [],
    flags: {},
    counters: {},
    notes: [],
  });

  // Define action buttons directly in TypeScript
  const actionButtons: ActionButton[] = [
    {
      id: "depot-intake",
      title: "Depot",
      x: 0.05,
      y: 0.235,
      w: 0.04,
      h: 0.11,
      color: "#ef4444",
      type: "direct",
      action: "recordDepotIntake",
    },
  ];

  // Action handlers defined inline
  const handleAction = (actionName: string, button?: ActionButton) => {
    switch (actionName) {
      case "recordDepotIntake":
        console.log("intake depot");
      default:
        console.warn(`Action handler not found: ${actionName}`);
    }
  };

  const handleButtonClick = (button: ActionButton) => {
    if (button.type === "direct" && button.action) {
      handleAction(button.action, button);
    } else if (button.type === "modal" && button.options) {
      setModalConfig({
        title: button.title,
        options: button.options,
      });
      setModalOpen(true);
    }
  };

  const handleModalOptionSelect = (option: ModalOption) => {
    handleAction(option.action);
  };

  const handleShotClick = (x: number, y: number, timestamp: number) => {
    const shotCount = selected === "1x" ? 1 : selected === "5x" ? 5 : 10;
    const newShots = Array.from({ length: shotCount }, () => ({
      x,
      y,
      timestamp,
    }));

    setScoutingData((prev) => ({
      ...prev,
      shots: [...prev.shots, ...newShots],
    }));
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
      </aside>

      {/* Canvas Area */}
      <ScoutingCanvas
        orientation={orientation}
        shots={scoutingData.shots}
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
