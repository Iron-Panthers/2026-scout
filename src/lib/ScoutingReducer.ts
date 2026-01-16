/**
 * ScoutingReducer - A state management system with built-in actions and undo functionality
 *
 * Provides SET, TOGGLE, INCREMENT, DECREMENT actions with path-based state updates
 * and full undo/redo history tracking.
 */

/**
 * Base state structure for scouting data
 */
export interface ScoutingData {
  shots: Array<{ x: number; y: number; timestamp: number }>;
  events: Array<{ type: string; timestamp: number; data?: any }>;
  counters: Record<string, number>;
}

/**
 * Action types supported by the reducer
 */
export enum ActionType {
  SET = "SET",
  TOGGLE = "TOGGLE",
  INCREMENT = "INCREMENT",
  DECREMENT = "DECREMENT",
  UNDO = "UNDO",
}

/**
 * Action payload definitions
 */
export interface SetAction {
  type: ActionType.SET;
  payload: {
    path: string;
    value: any;
  };
}

export interface ToggleAction {
  type: ActionType.TOGGLE;
  payload: {
    path: string;
  };
}

export interface IncrementAction {
  type: ActionType.INCREMENT;
  payload: {
    path: string;
    amount?: number;
  };
}

export interface DecrementAction {
  type: ActionType.DECREMENT;
  payload: {
    path: string;
    amount?: number;
  };
}

export interface UndoAction {
  type: ActionType.UNDO;
}

/**
 * Union type for all actions
 */
export type Action =
  | SetAction
  | ToggleAction
  | IncrementAction
  | DecrementAction
  | UndoAction;

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
    // Handle UNDO separately (doesn't add to history)
    if (action.type === ActionType.UNDO) {
      return this.handleUndo();
    }

    // Save current state to history before applying action
    this.addToHistory(this.currentState);

    switch (action.type) {
      case ActionType.SET:
        return this.handleSet(action.payload.path, action.payload.value);

      case ActionType.TOGGLE:
        return this.handleToggle(action.payload.path);

      case ActionType.INCREMENT:
        return this.handleIncrement(action.payload.path, action.payload.amount);

      case ActionType.DECREMENT:
        return this.handleDecrement(action.payload.path, action.payload.amount);

      default:
        console.warn("Unknown action type:", action);
        return this.currentState;
    }
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
