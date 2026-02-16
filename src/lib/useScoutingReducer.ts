import { useCallback, useReducer } from "react";
import { ScoutingReducer } from "./ScoutingReducer";
import type { Action, ScoutingData } from "./ScoutingReducer";

/**
 * Action creator functions for common operations
 */
export const actionCreators = {
  /**
   * Create a SET action
   */
  set: (path: string, value: any): Action => ({
    type: "SET",
    payload: { path, value },
  }),

  /**
   * Create a TOGGLE action
   */
  toggle: (path: string): Action => ({
    type: "TOGGLE",
    payload: { path },
  }),

  /**
   * Create an INCREMENT action
   */
  increment: (path: string, amount: number = 1): Action => ({
    type: "INCREMENT",
    payload: { path, amount },
  }),

  /**
   * Create a DECREMENT action
   */
  decrement: (path: string, amount: number = 1): Action => ({
    type: "DECREMENT",
    payload: { path, amount },
  }),

  /**
   * Create an UNDO action
   */
  undo: (): Action => ({
    type: "UNDO",
  }),

  /**
   * Create a LOG_EVENT action
   */
  logEvent: (eventType: string, timestamp: number): Action => ({
    type: "LOG_EVENT",
    payload: { eventType, timestamp },
  }),
};

/**
 * Return type for useScoutingReducer hook
 */
export interface UseScoutingReducerReturn<T> {
  state: T;
  dispatch: (action: Action) => void;
  set: (path: string, value: any) => void;
  toggle: (path: string) => void;
  increment: (path: string, amount?: number) => void;
  decrement: (path: string, amount?: number) => void;
  logEvent: (eventType: string) => void;
  undo: () => void;
  canUndo: boolean;
  historySize: number;
  clearHistory: () => void;
  reset: () => void;
}

/**
 * React hook for using ScoutingReducer with state management
 *
 * @param initialState - The initial state object
 * @param maxHistorySize - Maximum number of states to keep in history (default: 50)
 * @returns State and dispatch functions
 *
 * ```
 */

export function useScoutingReducer(
  matchId: string,
  role: string = "",
  event_code: string = "",
  match_number: number = 0,
  team_number: number = 0,
  match_type: string = "qual",
  maxHistorySize: number = 50
): UseScoutingReducerReturn<ScoutingData> {
  // Create reducer instance (only once)
  const [reducerInstance] = useReducer(
    () =>
      new ScoutingReducer<ScoutingData>(
        ScoutingReducer.createInitialState(matchId, role, event_code, match_number, team_number, match_type),
        maxHistorySize
      ),
    undefined,
    () =>
      new ScoutingReducer<ScoutingData>(
        ScoutingReducer.createInitialState(matchId, role, event_code, match_number, team_number, match_type),
        maxHistorySize
      )
  );

  // Use React's useReducer to trigger re-renders
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Dispatch function that applies actions and triggers re-renders
  const dispatch = useCallback(
    (action: Action) => {
      reducerInstance.reduce(action);
      forceUpdate();
    },
    [reducerInstance]
  );

  // Convenience methods
  const set = useCallback(
    (path: string, value: any) => {
      dispatch(actionCreators.set(path, value));
    },
    [dispatch]
  );

  const increment = useCallback(
    (path: string, amount?: number) => {
      dispatch(actionCreators.increment(path, amount));
    },
    [dispatch]
  );

  const decrement = useCallback(
    (path: string, amount?: number) => {
      dispatch(actionCreators.decrement(path, amount));
    },
    [dispatch]
  );

  const logEvent = useCallback(
    (eventType: string) => {
      const timestamp = reducerInstance.state.matchStartTime
        ? (Date.now() - reducerInstance.state.matchStartTime) / 1000
        : 0;
      dispatch(actionCreators.logEvent(eventType, timestamp));
    },
    [dispatch, reducerInstance]
  );

  const undo = useCallback(() => {
    dispatch(actionCreators.undo());
  }, [dispatch]);

  const clearHistory = useCallback(() => {
    reducerInstance.clearHistory();
  }, [reducerInstance]);

  const reset = useCallback(() => {
    reducerInstance.reset();
    forceUpdate();
  }, [reducerInstance]);

  const toggle = useCallback(
    (path: string) => {
      dispatch(actionCreators.toggle(path));
    },
    [dispatch]
  );

  return {
    state: reducerInstance.state,
    dispatch,
    set,
    toggle,
    increment,
    decrement,
    logEvent,
    undo,
    canUndo: reducerInstance.canUndo(),
    historySize: reducerInstance.getHistorySize(),
    clearHistory,
    reset,
  };
}
