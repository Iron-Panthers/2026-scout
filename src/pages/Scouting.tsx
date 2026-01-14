import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import fieldImage from "@/assets/FE-2026-_REBUILT_Playing_Field_With_Fuel.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Shot {
  x: number;
  y: number;
  timestamp: number;
}

export default function Scouting() {
  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const img = new Image();
    img.src = fieldImage;
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
  }, []);

  useEffect(() => {
    drawCanvas();
  }, [orientation, shots]);

  useEffect(() => {
    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [orientation, shots]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imageRef.current;

    if (!canvas || !container || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get container dimensions
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    let scale: number;
    let scaledWidth: number;
    let scaledHeight: number;
    let canvasWidth: number;
    let canvasHeight: number;

    // Set canvas size and scaling based on orientation
    if (orientation === 90 || orientation === 270) {
      // When rotated 90/270, maximize width (which becomes the rotated image height)
      scale = containerWidth / img.height;
      scaledWidth = img.width * scale;
      scaledHeight = img.height * scale;
      // Canvas dimensions are swapped for rotation
      canvasWidth = scaledHeight;
      canvasHeight = scaledWidth;
    } else {
      // When 0/180, maximize height
      scale = containerHeight / img.height;
      scaledWidth = img.width * scale;
      scaledHeight = img.height * scale;
      canvasWidth = scaledWidth;
      canvasHeight = scaledHeight;
    }

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply rotation transformation
    if (orientation === 90) {
      ctx.translate(canvasWidth, 0);
      ctx.rotate((90 * Math.PI) / 180);
    } else if (orientation === 180) {
      ctx.translate(canvasWidth, canvasHeight);
      ctx.rotate((180 * Math.PI) / 180);
    } else if (orientation === 270) {
      ctx.translate(0, canvasHeight);
      ctx.rotate((270 * Math.PI) / 180);
    }

    ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    ctx.restore();

    shots.forEach((shot) => {
      let shotX: number, shotY: number;

      if (orientation === 0) {
        shotX = shot.x * scaledWidth;
        shotY = shot.y * scaledHeight;
      } else if (orientation === 90) {
        shotX = canvasWidth - shot.y * scaledHeight;
        shotY = shot.x * scaledWidth;
      } else if (orientation === 180) {
        shotX = canvasWidth - shot.x * scaledWidth;
        shotY = canvasHeight - shot.y * scaledHeight;
      } else {
        shotX = shot.y * scaledHeight;
        shotY = canvasHeight - shot.x * scaledWidth;
      }

      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(shotX, shotY, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selected !== "1x" && selected !== "5x" && selected !== "10x") return;

    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasClickX = clickX * scaleX;
    const canvasClickY = clickY * scaleY;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    let scale: number;
    let scaledWidth: number;
    let scaledHeight: number;

    if (orientation === 90 || orientation === 270) {
      scale = containerWidth / img.height;
      scaledWidth = img.width * scale;
      scaledHeight = img.height * scale;
    } else {
      scale = containerHeight / img.height;
      scaledWidth = img.width * scale;
      scaledHeight = img.height * scale;
    }

    let normalizedX: number, normalizedY: number;

    if (orientation === 0) {
      normalizedX = canvasClickX / scaledWidth;
      normalizedY = canvasClickY / scaledHeight;
    } else if (orientation === 90) {
      normalizedX = canvasClickY / scaledWidth;
      normalizedY = 1 - canvasClickX / scaledHeight;
    } else if (orientation === 180) {
      normalizedX = 1 - canvasClickX / scaledWidth;
      normalizedY = 1 - canvasClickY / scaledHeight;
    } else {
      normalizedX = 1 - canvasClickY / scaledWidth;
      normalizedY = canvasClickX / scaledHeight;
    }

    const timestamp = Date.now() - startTimeRef.current;

    const shotCount = selected === "1x" ? 1 : selected === "5x" ? 5 : 10;

    const newShots = Array.from({ length: shotCount }, () => ({
      x: normalizedX,
      y: normalizedY,
      timestamp,
    }));

    setShots([...shots, ...newShots]);

    console.log(shots, newShots);
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
              90° (Clockwise)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrientation(180)}>
              180°
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrientation(270)}>
              270° (Counter-clockwise)
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

      {/* Main Content - Field Canvas */}
      <main className="flex-1 overflow-hidden relative">
        <div
          ref={containerRef}
          className={cn(
            "w-full h-full",
            orientation === 0 || orientation === 180
              ? "overflow-x-auto overflow-y-hidden"
              : "overflow-y-auto overflow-x-hidden"
          )}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="cursor-crosshair"
          />
        </div>
      </main>
    </div>
  );
}
