# State Reducer System - Usage Guide

## Overview

The State Reducer System provides a robust, type-safe way to manage complex state with built-in undo functionality. It replaces traditional `useState` patterns with a more maintainable and feature-rich solution.

## Key Features

- **Built-in Actions**: SET, TOGGLE, INCREMENT, DECREMENT
- **Undo/Redo**: Full history tracking with configurable size
- **Type-Safe**: Full TypeScript support with generics
- **Path-Based Updates**: Use dot notation for nested state updates
- **Immutable**: All state updates return new objects
- **React Integration**: Custom hook for seamless React usage

## Quick Start

### Basic Usage

```typescript
import { useScoutingReducer } from "@/lib/useScoutingReducer";

function MyComponent() {
  const { state, set, increment, undo, canUndo } = useScoutingReducer({
    counters: {},
    flags: {},
    data: [],
  });

  return (
    <div>
      <button onClick={() => increment("counters.clicks")}>
        Click Count: {state.counters.clicks || 0}
      </button>

      {canUndo && <button onClick={undo}>Undo</button>}
    </div>
  );
}
```

## API Reference

### `useScoutingReducer<T>(initialState, maxHistorySize?)`

React hook that returns state and action methods.

**Parameters:**

- `initialState: T` - The initial state object
- `maxHistorySize?: number` - Maximum history entries (default: 50)

**Returns:**

```typescript
{
  state: T;                                    // Current state
  dispatch: (action: Action) => void;          // Dispatch an action
  set: (path: string, value: any) => void;     // Set value at path
  toggle: (path: string) => void;              // Toggle boolean at path
  increment: (path: string, amount?: number) => void;  // Increment number
  decrement: (path: string, amount?: number) => void;  // Decrement number
  undo: () => void;                            // Undo last action
  canUndo: boolean;                            // Whether undo is available
  historySize: number;                         // Current history length
  clearHistory: () => void;                    // Clear all history
  reset: () => void;                           // Reset to initial state
}
```

## Path Notation

Use dot notation to access nested properties:

```typescript
// Root level
set("shots", []);

// Nested object
increment("counters.speakerShots");

// Deep nesting
set("user.settings.theme", "dark");
```

## Action Methods

### SET

Set any value at a path:

```typescript
// Set a primitive
set("name", "John");

// Set an object
set("user", { name: "John", age: 30 });

// Set nested value
set("counters.score", 100);

// Set array
set("shots", [...state.shots, newShot]);
```

### TOGGLE

Toggle a boolean value:

```typescript
// Toggle a flag
toggle("flags.isActive");

// Only works on booleans - other types will log error
toggle("counters.score"); // ❌ Error: not a boolean
```

### INCREMENT

Increment a number (initializes to 0 if undefined):

```typescript
// Increment by 1 (default)
increment("counters.clicks");

// Increment by specific amount
increment("counters.score", 10);

// Works even if counter doesn't exist yet
increment("counters.newCounter"); // Sets to 1
```

### DECREMENT

Decrement a number (prevents negative values):

```typescript
// Decrement by 1 (default)
decrement("counters.clicks");

// Decrement by specific amount
decrement("counters.score", 5);

// Won't go below 0
decrement("counters.small", 100); // Stops at 0
```

### UNDO

Revert to previous state:

```typescript
// Check if undo is available
if (canUndo) {
  undo();
}

// Undo button example
<button onClick={undo} disabled={!canUndo}>
  Undo ({historySize} states)
</button>;
```

## Common Patterns

### Recording Events

```typescript
// Add event to array
set("events", [...state.events, { type: "shot", timestamp: Date.now() }]);

// Increment counter
increment("counters.totalShots");
```

### Batch Operations

Multiple actions are tracked separately in history:

```typescript
// Each creates a history entry
increment("counters.shots");
set("lastShot", { x: 10, y: 20 });
toggle("flags.hasShot");

// User can undo each individually
```

### Conditional Updates

```typescript
const handleScore = (made: boolean) => {
  if (made) {
    increment("counters.made");
  } else {
    increment("counters.missed");
  }

  set("events", [
    ...state.events,
    { type: made ? "make" : "miss", timestamp: Date.now() },
  ]);
};
```

### State Reset

```typescript
// Reset to initial state (clears history)
reset();

// Clear history without resetting state
clearHistory();
```

## Migration from useState

### Before (useState):

```typescript
const [data, setData] = useState({
  counters: {},
  flags: {},
});

// Update counter
setData((prev) => ({
  ...prev,
  counters: {
    ...prev.counters,
    clicks: (prev.counters.clicks || 0) + 1,
  },
}));

// Toggle flag
setData((prev) => ({
  ...prev,
  flags: {
    ...prev.flags,
    isActive: !prev.flags.isActive,
  },
}));
```

### After (useScoutingReducer):

```typescript
const { state, increment, toggle } = useScoutingReducer({
  counters: {},
  flags: {},
});

// Update counter
increment("counters.clicks");

// Toggle flag
toggle("flags.isActive");
```

## Advanced Usage

### Custom State Types

```typescript
interface CustomState {
  user: {
    name: string;
    settings: {
      theme: "light" | "dark";
    };
  };
  data: Array<any>;
}

const { state, set } = useScoutingReducer<CustomState>({
  user: {
    name: "",
    settings: { theme: "light" },
  },
  data: [],
});

// Type-safe access
set("user.settings.theme", "dark"); // ✓
```

### Direct Dispatch

For more control, use dispatch with action objects:

```typescript
import { actionCreators } from "@/lib/useScoutingReducer";

const { dispatch } = useScoutingReducer(initialState);

// Use action creators
dispatch(actionCreators.set("path", value));
dispatch(actionCreators.increment("counter", 5));
dispatch(actionCreators.undo());
```

## Best Practices

1. **Use Path Notation**: Cleaner than nested object spreads

   ```typescript
   // ✓ Good
   increment("counters.shots");

   // ✗ Avoid
   set("counters", {
     ...state.counters,
     shots: (state.counters.shots || 0) + 1,
   });
   ```

2. **Check canUndo**: Always check before calling undo

   ```typescript
   // ✓ Good
   if (canUndo) undo();

   // ✗ Risky
   undo(); // Might log error if no history
   ```

3. **Initialize Nested Objects**: Ensure paths exist

   ```typescript
   // Initialize in initial state
   const { state, increment } = useScoutingReducer({
     counters: {}, // ✓ Empty object ready for counters
     flags: {},
   });
   ```

4. **Use Appropriate Actions**: Choose the right action for the job

   ```typescript
   // ✓ Good: Use INCREMENT for numbers
   increment("counters.score");

   // ✗ Avoid: Using SET for simple increments
   set("counters.score", (state.counters.score || 0) + 1);
   ```

5. **Manage History Size**: Configure based on needs

   ```typescript
   // For memory-sensitive apps
   const { state } = useScoutingReducer(initialState, 20);

   // For undo-heavy workflows
   const { state } = useScoutingReducer(initialState, 100);
   ```

## Troubleshooting

### Issue: State not updating

**Cause**: Path doesn't exist in state
**Solution**: Initialize the path in initial state

```typescript
// ✗ Problem
const { increment } = useScoutingReducer({ data: [] });
increment("counters.clicks"); // Creates counters object

// ✓ Solution
const { increment } = useScoutingReducer({
  data: [],
  counters: {}, // Pre-initialize
});
```

### Issue: Undo not working

**Cause**: No history available
**Solution**: Check `canUndo` before calling

```typescript
// ✓ Solution
{
  canUndo && <button onClick={undo}>Undo</button>;
}
```

### Issue: Type errors with paths

**Cause**: TypeScript can't validate path strings
**Solution**: Use constants for commonly used paths

```typescript
const PATHS = {
  SPEAKER_SHOTS: "counters.speakerShots",
  AMP_SCORES: "counters.ampScores",
} as const;

increment(PATHS.SPEAKER_SHOTS);
```

## Performance Considerations

- **History Size**: Larger history uses more memory
- **Deep Cloning**: State is deep cloned on each action (uses JSON.parse/stringify)
- **Re-renders**: Each action triggers a re-render
- **Path Traversal**: Complex paths have minimal overhead

For most scouting applications, performance is excellent. If you notice issues:

1. Reduce `maxHistorySize`
2. Batch related updates into single actions
3. Consider using `clearHistory()` periodically

## Summary

The State Reducer System simplifies state management with:

- ✓ Less boilerplate code
- ✓ Built-in undo functionality
- ✓ Type-safe operations
- ✓ Cleaner, more maintainable code
- ✓ Better developer experience

Perfect for complex state in scouting applications!
