
/**
 * ScoutingReducer - A state management system with built-in actions and undo functionality
 *
 * Provides SET, TOGGLE, INCREMENT, DECREMENT actions with path-based state updates
 * and full undo/redo history tracking.
 */

/**
 * Base state structure for scouting data
 */

export type Phase =
  | "auto"
  | "transition-shift"
  | "phase1"
  | "phase2"
  | "phase3"
  | "phase4"
  | "endgame";

export interface ScoutingData {
  matchId: string;
  event_code: string;
  match_number: number;
  team_number: number;
  match_type: string;
  role: string;
  matchStartTime: number | null;
  events: Array<{ type: string; timestamp: number }>;
  shots: Array<{ x: number; y: number; timestamp: number }>;
  comments: string;
  robot_problems: string | null;
  errors: string | null;
  defenseDescription: string | null;
}

/**
 * Action types supported by the reducer
 */
export type ActionType = "SET" | "TOGGLE" | "INCREMENT" | "DECREMENT" | "UNDO" | "LOG_EVENT";

/**
 * Action payload definitions
 */
export interface SetAction {
  type: "SET";
  payload: {
    path: string;
    value: any;
  };
}

export interface ToggleAction {
  type: "TOGGLE";
  payload: {
    path: string;
  };
}

export interface IncrementAction {
  type: "INCREMENT";
  payload: {
    path: string;
    amount?: number;
  };
}

export interface DecrementAction {
  type: "DECREMENT";
  payload: {
    path: string;
    amount?: number;
  };
}

export interface UndoAction {
  type: "UNDO";
}

export interface LogEventAction {
  type: "LOG_EVENT";
  payload: {
    eventType: string;
    timestamp: number;
  };
}

/**
 * Union type for all actions
 */
export type Action =
  | SetAction
  | ToggleAction
  | IncrementAction
  | DecrementAction
  | UndoAction
  | LogEventAction;

/**
 * ScoutingReducer class for managing scouting state with history
 */
export class ScoutingReducer<T extends Record<string, any> = ScoutingData> {
  private initialState: T;
  private currentState: T;
  private history: T[];
  private maxHistorySize: number;

  /**
   * Create a new ScoutingReducer with initial state
   * @param initialState - The initial state object
   * @param maxHistorySize - Maximum number of states to keep in history (default: 50)
   */
  constructor(initialState: T, maxHistorySize: number = 50) {
    this.initialState = { ...initialState };
    this.currentState = { ...initialState };
    this.history = [];
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Create an initial ScoutingData state object
   * @param matchId - The match ID for this match
   * @param role - The role for this match
   * @param event_code - The event code for this match (e.g., "2025cave")
   * @param match_number - The match number
   * @param team_number - The team number
   * @param match_type - The match type (qual, playoff, etc)
   * @returns ScoutingData
   */
  static createInitialState(
    matchId: string,
    role: string = "",
    event_code: string = "",
    match_number: number = 0,
    team_number: number = 0,
    match_type: string = "qual"
  ): ScoutingData {
    return {
      matchId,
      event_code,
      match_number,
      team_number,
      match_type,
      role,
      matchStartTime: null,
      events: [],
      shots: [],
      comments: "",
      errors: null,
      robot_problems: null,
      defenseDescription: null,
    };
  }

  /**
   * Get the current state
   */
  get state(): T {
    return this.currentState;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * Get the current history size
   */
  getHistorySize(): number {
    return this.history.length;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Reset to initial state
   */
  reset(): T {
    this.currentState = { ...this.initialState };
    this.history = [];
    return this.currentState;
  }

  /**
   * Reduce an action to produce a new state
   * @param action - The action to apply
   * @returns The new state
   */
  reduce(action: Action): T {
    // Log the action being dispatched
    console.log("[ScoutingReducer]", action.type, action);

    // Handle UNDO separately (doesn't add to history)
    if (action.type === "UNDO") {
      const newState = this.handleUndo();
      console.log("[ScoutingReducer] UNDO complete, history size:", this.history.length);
      console.log("[ScoutingReducer] Current state:", newState);
      return newState;
    }

    // Save current state to history before applying action
    this.addToHistory(this.currentState);

    let newState: T;
    switch (action.type) {
      case "SET":
        newState = this.handleSet(action.payload.path, action.payload.value);
        break;

      case "TOGGLE":
        newState = this.handleToggle(action.payload.path);
        break;

      case "INCREMENT":
        newState = this.handleIncrement(action.payload.path, action.payload.amount);
        break;

      case "DECREMENT":
        newState = this.handleDecrement(action.payload.path, action.payload.amount);
        break;

      case "LOG_EVENT":
        newState = this.handleLogEvent(action.payload.eventType, action.payload.timestamp);
        console.log("[ScoutingReducer] Event logged:", action.payload.eventType, "at", action.payload.timestamp.toFixed(2) + "s");
        break;

      default:
        console.warn("[ScoutingReducer] Unknown action type:", action);
        return this.currentState;
    }

    // Log the current state after action
    console.log("[ScoutingReducer] Current state:", newState);

    return newState;
  }

  /**
   * Add a state to history
   */
  private addToHistory(state: T): void {
    this.history.push(this.deepClone(state));

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift(); // Remove oldest state
    }
  }

  /**
   * Handle UNDO action - revert to previous state
   */
  private handleUndo(): T {
    if (this.history.length === 0) {
      console.warn("Cannot undo: no history available");
      return this.currentState;
    }

    const previousState = this.history.pop()!;
    this.currentState = previousState;
    return previousState;
  }

  /**
   * Handle SET action - set a value at the specified path
   */
  private handleSet(path: string, value: any): T {
    const newState = this.deepClone(this.currentState);
    this.setValueAtPath(newState, path, value);
    this.currentState = newState;
    return newState;
  }

  /**
   * Handle TOGGLE action - toggle a boolean value at the specified path
   */
  private handleToggle(path: string): T {
    const currentValue = this.getValueAtPath(this.currentState, path);

    if (typeof currentValue !== "boolean") {
      console.error(`Cannot toggle non-boolean value at path: ${path}`);
      return this.currentState;
    }

    const newState = this.deepClone(this.currentState);
    this.setValueAtPath(newState, path, !currentValue);
    this.currentState = newState;
    return newState;
  }

  /**
   * Handle INCREMENT action - increment a number at the specified path
   */
  private handleIncrement(path: string, amount: number = 1): T {
    const currentValue = this.getValueAtPath(this.currentState, path);
    const numValue = typeof currentValue === "number" ? currentValue : 0;

    const newState = this.deepClone(this.currentState);
    this.setValueAtPath(newState, path, numValue + amount);
    this.currentState = newState;
    return newState;
  }

  /**
   * Handle DECREMENT action - decrement a number at the specified path
   */
  private handleDecrement(path: string, amount: number = 1): T {
    const currentValue = this.getValueAtPath(this.currentState, path);
    const numValue = typeof currentValue === "number" ? currentValue : 0;
    const newValue = Math.max(0, numValue - amount); // Prevent negative values

    const newState = this.deepClone(this.currentState);
    this.setValueAtPath(newState, path, newValue);
    this.currentState = newState;
    return newState;
  }

  /**
   * Handle LOG_EVENT action - append an event to the events array
   */
  private handleLogEvent(eventType: string, timestamp: number): T {
    const newState = this.deepClone(this.currentState);
    if (!(newState as any).events) {
      (newState as any).events = [];
    }
    (newState as any).events.push({ type: eventType, timestamp });
    this.currentState = newState;
    return newState;
  }

  /**
   * Deep clone an object to ensure immutability
   */
  private deepClone<U>(obj: U): U {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Get a value at a path in an object
   * @param obj - The object to read from
   * @param path - Dot-notation path (e.g., "counters.speakerShots")
   * @returns The value at the path, or undefined if not found
   */
  private getValueAtPath(obj: any, path: string): any {
    const keys = path.split(".");
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Set a value at a path in an object (mutates the object)
   * @param obj - The object to modify
   * @param path - Dot-notation path (e.g., "counters.speakerShots")
   * @param value - The value to set
   */
  private setValueAtPath(obj: any, path: string, value: any): void {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== "object") {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }
}
