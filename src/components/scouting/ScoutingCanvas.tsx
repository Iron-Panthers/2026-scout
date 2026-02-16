import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { ActionButton, TransformedButton } from "@/types/actionButtons";
import fieldImage from "@/assets/FE-2026-_REBUILT_Playing_Field_With_Fuel.png";
import { getCurrentPhaseFromTime } from "@/lib/useMatchTimer";

interface Shot {
  x: number;
  y: number;
  timestamp: number;
}

interface ScoutingCanvasProps {
  orientation: 0 | 90 | 180 | 270;
  shots: Shot[];
  actionButtons: ActionButton[];
  showActionButtons: boolean;
  onButtonClick: (button: ActionButton) => void;
  onShotClick: (x: number, y: number, timestamp: number) => void;
  shotMultiplier: number;
  buttonPressCounts: Record<string, number>;
  pressedButtonId: string | null;
}

// Phase colors for shot visualization (full spectrum)
const PHASE_COLORS = {
  auto: "#dc2626",        // Bright Red
  "transition-shift": "#f59e0b", // Amber/Orange
  phase1: "#eab308",      // Yellow
  phase2: "#10b981",      // Emerald Green
  phase3: "#06b6d4",      // Cyan
  phase4: "#3b82f6",      // Blue
  endgame: "#8b5cf6",     // Purple
} as const;

// Helper to darken a color for press feedback
function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.max(0, Math.floor(r * (1 - amount)));
  const newG = Math.max(0, Math.floor(g * (1 - amount)));
  const newB = Math.max(0, Math.floor(b * (1 - amount)));

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

export interface ScoutingCanvasHandle {
  getCanvasElement: () => HTMLCanvasElement | null;
}

const ScoutingCanvas = forwardRef<ScoutingCanvasHandle, ScoutingCanvasProps>(
  (
    {
      orientation,
      shots,
      actionButtons,
      showActionButtons,
      onButtonClick,
      onShotClick,
      shotMultiplier,
      buttonPressCounts,
      pressedButtonId,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    useImperativeHandle(ref, () => ({
      getCanvasElement: () => canvasRef.current,
    }));

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
    }, [orientation, shots, showActionButtons, actionButtons, buttonPressCounts, pressedButtonId]);

    useEffect(() => {
      const handleResize = () => drawCanvas();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [orientation, shots, showActionButtons, actionButtons, buttonPressCounts, pressedButtonId]);

    const drawCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const img = imageRef.current;

      if (!canvas || !container || !img) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      let scale: number;
      let scaledWidth: number;
      let scaledHeight: number;
      let canvasWidth: number;
      let canvasHeight: number;

      if (orientation === 90 || orientation === 270) {
        scale = containerWidth / img.height;
        scaledWidth = img.width * scale;
        scaledHeight = img.height * scale;
        canvasWidth = scaledHeight;
        canvasHeight = scaledWidth;
      } else {
        scale = containerHeight / img.height;
        scaledWidth = img.width * scale;
        scaledHeight = img.height * scale;
        canvasWidth = scaledWidth;
        canvasHeight = scaledHeight;
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      ctx.save();

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

        // Color shot based on phase (using centralized phase calculation)
        const phase = getCurrentPhaseFromTime(shot.timestamp);
        ctx.fillStyle = PHASE_COLORS[phase];
        ctx.beginPath();
        ctx.arc(shotX, shotY, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      if (showActionButtons) {
        actionButtons.forEach((button) => {
          const transformed = transformButtonCoords(
            button,
            orientation,
            scaledWidth,
            scaledHeight,
            canvasWidth,
            canvasHeight
          );

          const isPressed = pressedButtonId === button.id;
          const pressCount = buttonPressCounts[button.id] || 0;
          const isNonRepeatableUsed = button.repeatable === false && pressCount > 0;

          // Determine button color
          let buttonColor: string;
          if (isNonRepeatableUsed) {
            // Grey out non-repeatable buttons that have been used
            buttonColor = "#808080";
          } else if (isPressed) {
            // Darken color if currently pressed (visual feedback)
            buttonColor = darkenColor(button.color, 0.3);
          } else {
            // Normal color
            buttonColor = button.color;
          }

          ctx.fillStyle = buttonColor;
          ctx.fillRect(
            transformed.x,
            transformed.y,
            transformed.width,
            transformed.height
          );

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.strokeRect(
            transformed.x,
            transformed.y,
            transformed.width,
            transformed.height
          );

          // Large background count number (only for repeatable buttons with count > 0)
          if (button.repeatable !== false && button.type === "direct" && pressCount > 0) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            ctx.font = `bold ${Math.min(transformed.width, transformed.height) * 0.8}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              pressCount.toString(),
              transformed.x + transformed.width / 2,
              transformed.y + transformed.height / 2
            );
          }

          // Button label (on top of count)
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            button.title,
            transformed.x + transformed.width / 2,
            transformed.y + transformed.height / 2
          );
        });
      }
    };

    const transformButtonCoords = (
      button: ActionButton,
      orientation: 0 | 90 | 180 | 270,
      scaledWidth: number,
      scaledHeight: number,
      canvasWidth: number,
      canvasHeight: number
    ): TransformedButton => {
      let x: number, y: number, width: number, height: number;

      if (orientation === 0) {
        x = button.x * scaledWidth;
        y = button.y * scaledHeight;
        width = button.w * scaledWidth;
        height = button.h * scaledHeight;
      } else if (orientation === 90) {
        x = canvasWidth - (button.y + button.h) * scaledHeight;
        y = button.x * scaledWidth;
        width = button.h * scaledHeight;
        height = button.w * scaledWidth;
      } else if (orientation === 180) {
        x = canvasWidth - (button.x + button.w) * scaledWidth;
        y = canvasHeight - (button.y + button.h) * scaledHeight;
        width = button.w * scaledWidth;
        height = button.h * scaledHeight;
      } else {
        x = button.y * scaledHeight;
        y = canvasHeight - (button.x + button.w) * scaledWidth;
        width = button.h * scaledHeight;
        height = button.w * scaledWidth;
      }

      return { button, x, y, width, height };
    };

    const isClickOnButton = (
      clickX: number,
      clickY: number,
      transformed: TransformedButton
    ): boolean => {
      return (
        clickX >= transformed.x &&
        clickX <= transformed.x + transformed.width &&
        clickY >= transformed.y &&
        clickY <= transformed.y + transformed.height
      );
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
      let canvasWidth: number;
      let canvasHeight: number;

      if (orientation === 90 || orientation === 270) {
        scale = containerWidth / img.height;
        scaledWidth = img.width * scale;
        scaledHeight = img.height * scale;
        canvasWidth = scaledHeight;
        canvasHeight = scaledWidth;
      } else {
        scale = containerHeight / img.height;
        scaledWidth = img.width * scale;
        scaledHeight = img.height * scale;
        canvasWidth = scaledWidth;
        canvasHeight = scaledHeight;
      }

      if (showActionButtons) {
        for (const button of actionButtons) {
          const transformed = transformButtonCoords(
            button,
            orientation,
            scaledWidth,
            scaledHeight,
            canvasWidth,
            canvasHeight
          );

          if (isClickOnButton(canvasClickX, canvasClickY, transformed)) {
            onButtonClick(button);
            return;
          }
        }
        return;
      }

      if (shotMultiplier === 0) return;

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

      const timestamp = Date.now();
      onShotClick(normalizedX, normalizedY, timestamp);
    };

    return (
      <div
        ref={containerRef}
        className={`flex-1 ${
          orientation === 0 || orientation === 180
            ? "overflow-x-auto"
            : "overflow-y-auto"
        }`}
      >
        <canvas ref={canvasRef} onClick={handleCanvasClick} />
      </div>
    );
  }
);

ScoutingCanvas.displayName = "ScoutingCanvas";

export default ScoutingCanvas;
