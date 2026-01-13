import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Scouting() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("");

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-48 border-r border-border bg-card p-3 flex flex-col gap-3">
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

      {/* Main Content - Field Image */}
      <main className="flex-1 p-4 flex items-center justify-center overflow-hidden">
        <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg">
          <div className="w-full h-full flex items-center justify-center">
            {/* Placeholder for field image */}
            <div className="text-muted-foreground text-center">
              <p className="text-lg font-semibold">Field Image</p>
              <p className="text-sm">
                Add field.png to src/assets folder
              </p>
              <p className="text-xs mt-2">
                Selected: {selected || "None"}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
