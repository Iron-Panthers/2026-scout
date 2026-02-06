import { useEffect, useState } from "react";

interface PhaseTransitionOverlayProps {
  show: boolean;
  nextPhaseName: string | null;
}

/**
 * Full-screen flashing overlay that alerts the scout to switch phases.
 * It is transparent and click-through (pointer-events: none) so scouting
 * actions are not blocked while it is visible.
 */
export default function PhaseTransitionOverlay({
  show,
  nextPhaseName,
}: PhaseTransitionOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(show);
  }, [show]);

  if (!visible || !nextPhaseName) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
      style={{ animation: "phaseFlash 0.5s ease-in-out 6 alternate" }}
    >
      <div className="bg-yellow-400/30 absolute inset-0" />
      <div className="relative text-center px-4 py-3">
        <p
          className="text-2xl sm:text-3xl font-black tracking-wide text-white drop-shadow-lg"
          style={{
            textShadow:
              "0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5), 2px 2px 4px rgba(0,0,0,0.9)",
          }}
        >
          SWITCH TO
        </p>
        <p
          className="text-4xl sm:text-5xl font-black tracking-wider text-yellow-300 mt-1 drop-shadow-lg"
          style={{
            textShadow:
              "0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(234,179,8,0.5), 2px 2px 4px rgba(0,0,0,0.9)",
          }}
        >
          {nextPhaseName}
        </p>
      </div>

      <style>{`
        @keyframes phaseFlash {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
