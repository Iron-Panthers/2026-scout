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

interface Dot {
  x: number; // 0-1 normalized coordinates
  y: number; // 0-1 normalized coordinates
  color?: string;
  label?: string;
}

export default function Scouting() {
  const [selected, setSelected] = useState("");
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load the field image
  useEffect(() => {
    const img = new Image();
    img.src = fieldImage;
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
  }, []);

  // Redraw canvas when orientation or dots change
  useEffect(() => {
    drawCanvas();
  }, [orientation, dots]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => drawCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [orientation, dots]);

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

    // Draw the field image
    ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    // Restore context state before drawing dots
    ctx.restore();

    // Draw dots on top (in canvas coordinates, not rotated)
    dots.forEach((dot) => {
      // Transform dot coordinates based on rotation
      let dotX: number, dotY: number;
      
      if (orientation === 0) {
        dotX = dot.x * scaledWidth;
        dotY = dot.y * scaledHeight;
      } else if (orientation === 90) {
        dotX = canvasWidth - (dot.y * scaledHeight);
        dotY = dot.x * scaledWidth;
      } else if (orientation === 180) {
        dotX = canvasWidth - (dot.x * scaledWidth);
        dotY = canvasHeight - (dot.y * scaledHeight);
      } else { // 270
        dotX = dot.y * scaledHeight;
        dotY = canvasHeight - (dot.x * scaledWidth);
      }

      ctx.fillStyle = dot.color || "red";
      ctx.beginPath();
      ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Draw label if present
      if (dot.label) {
        ctx.fillStyle = "white";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(dot.label, dotX, dotY + 4);
      }
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click coordinates based on canvas scaling (display vs actual canvas size)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasClickX = clickX * scaleX;
    const canvasClickY = clickY * scaleY;

    // Get the original image dimensions used in drawing
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

    // Transform click coordinates back to normalized field coordinates (0-1) based on rotation
    let normalizedX: number, normalizedY: number;

    if (orientation === 0) {
      normalizedX = canvasClickX / scaledWidth;
      normalizedY = canvasClickY / scaledHeight;
    } else if (orientation === 90) {
      normalizedX = canvasClickY / scaledWidth;
      normalizedY = 1 - (canvasClickX / scaledHeight);
    } else if (orientation === 180) {
      normalizedX = 1 - (canvasClickX / scaledWidth);
      normalizedY = 1 - (canvasClickY / scaledHeight);
    } else { // 270
      normalizedX = 1 - (canvasClickY / scaledWidth);
      normalizedY = canvasClickX / scaledHeight;
    }

    // Add dot with selected multiplier color
    const color =
      selected === "1x"
        ? "#3b82f6" // blue
        : selected === "5x"
        ? "#eab308" // yellow
        : selected === "10x"
        ? "#22c55e" // green
        : selected === "action"
        ? "#ef4444" // red
        : "#6b7280"; // gray default

    setDots([...dots, { x: normalizedX, y: normalizedY, color }]);
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
