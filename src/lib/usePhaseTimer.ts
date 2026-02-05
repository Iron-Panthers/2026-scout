import { useState, useEffect, useCallback, useRef } from "react";
import type { Phase } from "./ScoutingReducer";

/**
 * Phase durations in seconds, based on the FRC 2026 REBUILT game manual.
 *
 * Auto:             20s  (match clock 0:20 → 0:00)
 * Transition Shift: 10s  (teleop clock 2:20 → 2:10)
 * Shift 1 (phase1): 25s  (teleop clock 2:10 → 1:45)
 * Shift 2 (phase2): 25s  (teleop clock 1:45 → 1:20)
 * Shift 3 (phase3): 25s  (teleop clock 1:20 → 0:55)
 * Shift 4 (phase4): 25s  (teleop clock 0:55 → 0:30)
 * Endgame:          30s  (teleop clock 0:30 → 0:00)
 *
 * Total: 160s = 2 minutes 40 seconds
 */
export const PHASE_DURATIONS: Record<Phase, number> = {
  auto: 20,
  "transition-shift": 10,
  phase1: 25,
  phase2: 25,
  phase3: 25,
  phase4: 25,
  endgame: 30,
};

export const PHASE_DISPLAY_NAMES: Record<Phase, string> = {
  auto: "Auto",
  "transition-shift": "Transition Shift",
  phase1: "Shift 1",
  phase2: "Shift 2",
  phase3: "Shift 3",
  phase4: "Shift 4",
  endgame: "Endgame",
};

const PHASES_IN_ORDER: Phase[] = [
  "auto",
  "transition-shift",
  "phase1",
  "phase2",
  "phase3",
  "phase4",
  "endgame",
];

export interface PhaseTimerState {
  /** Seconds remaining in the current phase */
  timeRemaining: number;
  /** Total duration of the current phase in seconds */
  phaseDuration: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Whether the transition overlay should be shown */
  showTransitionAlert: boolean;
  /** The next phase name to display in the overlay */
  nextPhaseName: string | null;
  /** Start / resume the timer */
  start: () => void;
  /** Pause the timer */
  pause: () => void;
  /** Reset the timer for the current phase */
  reset: () => void;
  /** Acknowledge the transition alert (dismiss overlay) */
  dismissAlert: () => void;
}

export function usePhaseTimer(
  currentPhase: Phase,
  onPhaseTimeUp?: (nextPhase: Phase | null) => void
): PhaseTimerState {
  const phaseDuration = PHASE_DURATIONS[currentPhase];
  const [timeRemaining, setTimeRemaining] = useState(phaseDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [showTransitionAlert, setShowTransitionAlert] = useState(false);
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredRef = useRef(false);

  // Get the next phase (if any)
  const currentIndex = PHASES_IN_ORDER.indexOf(currentPhase);
  const nextPhase =
    currentIndex < PHASES_IN_ORDER.length - 1
      ? PHASES_IN_ORDER[currentIndex + 1]
      : null;
  const nextPhaseName = nextPhase ? PHASE_DISPLAY_NAMES[nextPhase] : null;

  // Reset timer when phase changes
  useEffect(() => {
    const newDuration = PHASE_DURATIONS[currentPhase];
    setTimeRemaining(newDuration);
    setShowTransitionAlert(false);
    hasTriggeredRef.current = false;
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
  }, [currentPhase]);

  // Countdown interval
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  // Trigger transition alert when time hits 0
  useEffect(() => {
    if (timeRemaining === 0 && !hasTriggeredRef.current && isRunning) {
      hasTriggeredRef.current = true;
      setIsRunning(false);

      if (nextPhase) {
        setShowTransitionAlert(true);
        onPhaseTimeUp?.(nextPhase);

        // Auto-dismiss after 4 seconds
        alertTimeoutRef.current = setTimeout(() => {
          setShowTransitionAlert(false);
          alertTimeoutRef.current = null;
        }, 4000);
      } else {
        // Last phase (endgame) - match over
        onPhaseTimeUp?.(null);
      }
    }
  }, [timeRemaining, isRunning, nextPhase, onPhaseTimeUp]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
    };
  }, []);

  const start = useCallback(() => {
    if (timeRemaining > 0) {
      setIsRunning(true);
    }
  }, [timeRemaining]);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    setTimeRemaining(PHASE_DURATIONS[currentPhase]);
    setIsRunning(false);
    setShowTransitionAlert(false);
    hasTriggeredRef.current = false;
  }, [currentPhase]);

  const dismissAlert = useCallback(() => {
    setShowTransitionAlert(false);
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
  }, []);

  return {
    timeRemaining,
    phaseDuration,
    isRunning,
    showTransitionAlert,
    nextPhaseName,
    start,
    pause,
    reset,
    dismissAlert,
  };
}
