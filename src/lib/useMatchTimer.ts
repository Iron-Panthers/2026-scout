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

export const TOTAL_MATCH_DURATION = 160; // seconds; display countdown starts at 2:40
const AUTO_END_TIME = 20;
const TRANSITION_PAUSE_MS = 3000;

export interface MatchTimerState {
  /** Total elapsed time in the match (0-160 seconds) */
  elapsedTime: number;
  /** Remaining time on the countdown clock */
  timeRemaining: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Whether the timer is paused for the 3-second auto-to-teleop handoff */
  isTransitionPaused: boolean;
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
  if (elapsedTime < 30) return "transition-shift";
  if (elapsedTime < 55) return "phase1";
  if (elapsedTime < 80) return "phase2";
  if (elapsedTime < 105) return "phase3";
  if (elapsedTime < 130) return "phase4";
  return "endgame";
}

/**
 * Hook for managing the continuous match timer
 * Unlike usePhaseTimer, this timer runs continuously through the entire match
 */
export function useMatchTimer(): MatchTimerState {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isTransitionPaused, setIsTransitionPaused] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const transitionPauseRef = useRef<number | null>(null);

  const clearTransitionPause = useCallback(() => {
    if (transitionPauseRef.current !== null) {
      window.clearTimeout(transitionPauseRef.current);
      transitionPauseRef.current = null;
    }
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Calculate current phase based on elapsed time
  const currentPhase = getCurrentPhaseFromTime(elapsedTime);

  // Calculate phase-specific time values
  const phaseStartTime = PHASE_START_TIMES[currentPhase];
  const phaseDuration = PHASE_DURATIONS[currentPhase];

  // Time elapsed within the current phase
  const phaseElapsedTime = Math.max(0, Math.min(elapsedTime - phaseStartTime, phaseDuration));
  const phaseTimeRemaining = Math.max(0, phaseDuration - phaseElapsedTime);
  const phaseProgress = phaseDuration > 0 ? phaseElapsedTime / phaseDuration : 0;
  const timeRemaining = Math.max(0, TOTAL_MATCH_DURATION - elapsedTime);

  // Main timer loop using requestAnimationFrame for smooth updates
  useEffect(() => {
    if (!isRunning || isTransitionPaused || elapsedTime >= TOTAL_MATCH_DURATION) {
      return;
    }

    const updateTimer = () => {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now() - (elapsedTime * 1000);
      }

      const now = Date.now();
      const nextElapsed = (now - startTimeRef.current) / 1000;

      if (nextElapsed >= AUTO_END_TIME && elapsedTime < AUTO_END_TIME) {
        setElapsedTime(AUTO_END_TIME);
        setIsRunning(false);
        setIsTransitionPaused(true);
        clearTransitionPause();
        transitionPauseRef.current = window.setTimeout(() => {
          transitionPauseRef.current = null;
          setIsTransitionPaused(false);
          setIsRunning(true);
          startTimeRef.current = Date.now() - (AUTO_END_TIME * 1000);
        }, TRANSITION_PAUSE_MS);
        return;
      }

      if (nextElapsed >= TOTAL_MATCH_DURATION) {
        setElapsedTime(TOTAL_MATCH_DURATION);
        setIsRunning(false);
      } else {
        setElapsedTime(nextElapsed);
        animationFrameRef.current = requestAnimationFrame(updateTimer);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateTimer);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [clearTransitionPause, elapsedTime, isRunning, isTransitionPaused]);

  const startMatch = useCallback(() => {
    setHasStarted(true);
    setIsRunning(true);
    setIsTransitionPaused(false);
    clearTransitionPause();
    startTimeRef.current = Date.now();
    setElapsedTime(0);
  }, [clearTransitionPause]);

  const resetMatch = useCallback(() => {
    clearTransitionPause();
    setElapsedTime(0);
    setIsRunning(false);
    setIsTransitionPaused(false);
    setHasStarted(false);
    startTimeRef.current = null;
    stopAnimation();
  }, [clearTransitionPause, stopAnimation]);

  const skipToPhase = useCallback((phase: Phase) => {
    clearTransitionPause();
    setIsTransitionPaused(false);
    stopAnimation();

    const targetTime = PHASE_START_TIMES[phase];

    setElapsedTime(targetTime);
    startTimeRef.current = Date.now() - (targetTime * 1000);

    if (!hasStarted) {
      setHasStarted(true);
    }
    setIsRunning(true);
  }, [clearTransitionPause, hasStarted, stopAnimation]);

  useEffect(() => {
    return () => {
      clearTransitionPause();
      stopAnimation();
    };
  }, [clearTransitionPause, stopAnimation]);

  return {
    elapsedTime,
    timeRemaining,
    isRunning,
    isTransitionPaused,
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
