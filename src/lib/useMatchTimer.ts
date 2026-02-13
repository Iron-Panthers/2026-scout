import { useState, useEffect, useCallback, useRef } from "react";
import type { Phase } from "./ScoutingReducer";

/**
 * Phase durations and start times in the 160-second match
 *
 * Auto:             0-20s   (20s duration)
 * Transition Shift: 20-30s  (10s duration)
 * Phase 1:          30-55s  (25s duration)
 * Phase 2:          55-80s  (25s duration)
 * Phase 3:          80-105s (25s duration)
 * Phase 4:          105-130s (25s duration)
 * Endgame:          130-160s (30s duration)
 *
 * Total: 160 seconds
 */

export const PHASE_START_TIMES: Record<Phase, number> = {
  "auto": 0,
  "transition-shift": 20,
  "phase1": 30,
  "phase2": 55,
  "phase3": 80,
  "phase4": 105,
  "endgame": 130,
};

export const PHASE_END_TIMES: Record<Phase, number> = {
  "auto": 20,
  "transition-shift": 30,
  "phase1": 55,
  "phase2": 80,
  "phase3": 105,
  "phase4": 130,
  "endgame": 160,
};

export const PHASE_DURATIONS: Record<Phase, number> = {
  "auto": 20,
  "transition-shift": 10,
  "phase1": 25,
  "phase2": 25,
  "phase3": 25,
  "phase4": 25,
  "endgame": 30,
};

export const TOTAL_MATCH_DURATION = 160; // seconds

export interface MatchTimerState {
  /** Total elapsed time in the match (0-160 seconds) */
  elapsedTime: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Whether the match has started */
  hasStarted: boolean;
  /** Time remaining in the current phase */
  phaseTimeRemaining: number;
  /** Duration of the current phase */
  phaseDuration: number;
  /** Progress through current phase (0-1) */
  phaseProgress: number;
  /** Start the match timer */
  startMatch: () => void;
  /** Reset the timer and go back to pre-match state */
  resetMatch: () => void;
  /** Skip to the start of a specific phase */
  skipToPhase: (phase: Phase) => void;
}

/**
 * Hook for managing the continuous match timer
 * Unlike usePhaseTimer, this timer runs continuously through the entire match
 */
export function useMatchTimer(currentPhase: Phase): MatchTimerState {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate phase-specific time values
  const phaseStartTime = PHASE_START_TIMES[currentPhase];
  const phaseEndTime = PHASE_END_TIMES[currentPhase];
  const phaseDuration = PHASE_DURATIONS[currentPhase];

  // Time elapsed within the current phase
  const phaseElapsedTime = Math.max(0, Math.min(elapsedTime - phaseStartTime, phaseDuration));
  const phaseTimeRemaining = Math.max(0, phaseDuration - phaseElapsedTime);
  const phaseProgress = phaseDuration > 0 ? phaseElapsedTime / phaseDuration : 0;

  // Main timer loop using requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!isRunning || elapsedTime >= TOTAL_MATCH_DURATION) {
      if (elapsedTime >= TOTAL_MATCH_DURATION) {
        setIsRunning(false);
      }
      return;
    }

    const updateTimer = () => {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now() - (elapsedTime * 1000);
      }

      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000;

      if (elapsed >= TOTAL_MATCH_DURATION) {
        setElapsedTime(TOTAL_MATCH_DURATION);
        setIsRunning(false);
      } else {
        setElapsedTime(elapsed);
        animationFrameRef.current = requestAnimationFrame(updateTimer);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateTimer);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, elapsedTime]);

  const startMatch = useCallback(() => {
    setHasStarted(true);
    setIsRunning(true);
    startTimeRef.current = Date.now();
    setElapsedTime(0);
  }, []);

  const resetMatch = useCallback(() => {
    setElapsedTime(0);
    setIsRunning(false);
    setHasStarted(false);
    startTimeRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const skipToPhase = useCallback((phase: Phase) => {
    const targetTime = PHASE_START_TIMES[phase];

    // Cancel any existing animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Set the new time and start reference
    setElapsedTime(targetTime);
    startTimeRef.current = Date.now() - (targetTime * 1000);

    // Ensure timer is running
    if (!hasStarted) {
      setHasStarted(true);
    }
    if (!isRunning) {
      setIsRunning(true);
    }
  }, [hasStarted, isRunning]);

  return {
    elapsedTime,
    isRunning,
    hasStarted,
    phaseTimeRemaining,
    phaseDuration,
    phaseProgress,
    startMatch,
    resetMatch,
    skipToPhase,
  };
}
