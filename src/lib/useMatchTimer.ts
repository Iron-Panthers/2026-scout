import { useState, useEffect, useCallback, useRef } from "react";
import type { Phase } from "./ScoutingReducer";

/**
 * Phase durations and start times in the 163-second match
 * Includes 3-second delay between auto and teleop (as per FRC match rules)
 *
 * Auto:             0-20s   (20s duration)
 * [3-second delay:  20-23s]
 * Transition Shift: 23-33s  (10s duration)
 * Phase 1:          33-58s  (25s duration)
 * Phase 2:          58-83s  (25s duration)
 * Phase 3:          83-108s (25s duration)
 * Phase 4:          108-133s (25s duration)
 * Endgame:          133-163s (30s duration)
 *
 * Total: 163 seconds
 */

export const PHASE_START_TIMES: Record<Phase, number> = {
  "auto": 0,
  "transition-shift": 23,
  "phase1": 33,
  "phase2": 58,
  "phase3": 83,
  "phase4": 108,
  "endgame": 133,
};

export const PHASE_END_TIMES: Record<Phase, number> = {
  "auto": 20,
  "transition-shift": 33,
  "phase1": 58,
  "phase2": 83,
  "phase3": 108,
  "phase4": 133,
  "endgame": 163,
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

export const TOTAL_MATCH_DURATION = 163; // seconds

export interface MatchTimerState {
  /** Total elapsed time in the match (0-160 seconds) */
  elapsedTime: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Whether the match has started */
  hasStarted: boolean;
  /** Current phase based on elapsed time */
  currentPhase: Phase;
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
 * Calculate current phase based on elapsed time
 * EXPORTED - Use this everywhere for consistent phase calculation
 * Note: 3-second delay between auto (ends at 20s) and transition-shift (starts at 23s)
 */
export function getCurrentPhaseFromTime(elapsedTime: number): Phase {
  if (elapsedTime < 20) return "auto";
  if (elapsedTime < 33) return "transition-shift";
  if (elapsedTime < 58) return "phase1";
  if (elapsedTime < 83) return "phase2";
  if (elapsedTime < 108) return "phase3";
  if (elapsedTime < 133) return "phase4";
  return "endgame";
}

/**
 * Hook for managing the continuous match timer
 * Unlike usePhaseTimer, this timer runs continuously through the entire match
 */
export function useMatchTimer(): MatchTimerState {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Calculate current phase based on elapsed time
  const currentPhase = getCurrentPhaseFromTime(elapsedTime);

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
    currentPhase,
    phaseTimeRemaining,
    phaseDuration,
    phaseProgress,
    startMatch,
    resetMatch,
    skipToPhase,
  };
}
