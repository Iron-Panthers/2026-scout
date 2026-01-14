import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { ActionButton, TransformedButton } from "@/types/actionButtons";
import fieldImage from "@/assets/FE-2026-_REBUILT_Playing_Field_With_Fuel.png";

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
    }, [orientation, shots, showActionButtons, actionButtons]);

    useEffect(() => {
      const handleResize = () => drawCanvas();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [orientation, shots, showActionButtons, actionButtons]);

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

        ctx.fillStyle = "#3b82f6";
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

          ctx.fillStyle = button.color;
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
