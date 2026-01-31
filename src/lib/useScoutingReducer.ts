import { useCallback, useReducer } from "react";
import { ScoutingReducer } from "./ScoutingReducer";
import type { Action, ScoutingData, Phase } from "./ScoutingReducer";

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
  undo: () => void;
  canUndo: boolean;
  historySize: number;
  clearHistory: () => void;
  reset: () => void;
  setPhase: (phase: Phase) => void;
  currentPhase: Phase;
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
  event_id: string = "",
  match_number: number = 0,
  maxHistorySize: number = 50
): UseScoutingReducerReturn<ScoutingData> {
  // Create reducer instance (only once)
  const [reducerInstance] = useReducer(
    () =>
      new ScoutingReducer<ScoutingData>(
        ScoutingReducer.createInitialState(matchId, role, event_id, match_number),
        maxHistorySize
      ),
    undefined,
    () =>
      new ScoutingReducer<ScoutingData>(
        ScoutingReducer.createInitialState(matchId, role, event_id, match_number),
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
      const finalPath = path.replace(
        "{phase}",
        reducerInstance.state.currentPhase
      );
      dispatch(actionCreators.set(finalPath, value));
    },
    [dispatch, reducerInstance]
  );

  const increment = useCallback(
    (path: string, amount?: number) => {
      const finalPath = path.replace(
        "{phase}",
        reducerInstance.state.currentPhase
      );
      dispatch(actionCreators.increment(finalPath, amount));
    },
    [dispatch, reducerInstance]
  );

  const decrement = useCallback(
    (path: string, amount?: number) => {
      const finalPath = path.replace(
        "{phase}",
        reducerInstance.state.currentPhase
      );
      dispatch(actionCreators.decrement(finalPath, amount));
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
      const finalPath = path.replace(
        "{phase}",
        reducerInstance.state.currentPhase
      );
      dispatch(actionCreators.toggle(finalPath));
    },
    [dispatch, reducerInstance]
  );

  const setPhase = useCallback(
    (phase: Phase) => {
      // Directly update the reducerInstance's state if possible
      if ("currentPhase" in reducerInstance.state) {
        reducerInstance.state.currentPhase = phase;
        forceUpdate();
      }
    },
    [reducerInstance, forceUpdate]
  );

  return {
    state: reducerInstance.state,
    dispatch,
    set,
    toggle,
    increment,
    decrement,
    undo,
    canUndo: reducerInstance.canUndo(),
    historySize: reducerInstance.getHistorySize(),
    clearHistory,
    reset,
    setPhase,
    currentPhase: reducerInstance.state.currentPhase,
  };
}
