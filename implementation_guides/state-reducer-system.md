# State Reducer System Implementation Plan

## Overview

Create a dedicated reducer class for managing scouting state with built-in actions (SET, TOGGLE, INCREMENT, DECREMENT) and undo functionality. This will replace the current useState-based state management with a more robust and maintainable solution.

---

## Phase 1: Core Reducer Architecture

### Objective

Create the foundational reducer class with initial state and basic action types.

### Tasks

1. **Create reducer file structure**

   - Create `src/lib/ScoutingReducer.ts`
   - Define TypeScript interfaces for state structure
   - Define action type enums

2. **Define action interfaces**

   - Create `Action` type union for all action types
   - Define payload structures for each action:
     - `SET`: `{ path: string, value: any }`
     - `TOGGLE`: `{ path: string }`
     - `INCREMENT`: `{ path: string, amount?: number }`
     - `DECREMENT`: `{ path: string, amount?: number }`
     - `UNDO`: no payload

3. **Implement ScoutingReducer class**

   - Constructor that accepts initial state
   - Store initial state as private property
   - Create public getter for current state
   - Implement state immutability helpers

4. **Create basic reducer function**
   - Implement switch statement for action types
   - Handle SET action (set value at path)
   - Return new state object (immutable)

### Quality Assurance

- [x] TypeScript compiles without errors
- [x] All action types are properly typed
- [x] Initial state can be set via constructor
- [x] State is immutable (new object returned on each action)
- [x] Path notation works correctly (e.g., "counters.speakerShots")

---

## Phase 2: Action Implementations

### Objective

Implement all core actions (SET, TOGGLE, INCREMENT, DECREMENT) with proper path traversal.

### Tasks

1. **Implement path traversal utility**

   - Create `getValueAtPath(state, path)` helper
   - Create `setValueAtPath(state, path, value)` helper
   - Handle nested objects and arrays
   - Handle dot notation (e.g., "flags.wasPinned")

2. **Implement SET action**

   - Use path traversal to set value
   - Handle deep nested paths
   - Preserve other state properties
   - Return new state object

3. **Implement TOGGLE action**

   - Retrieve boolean value at path
   - Toggle the boolean value
   - Handle non-boolean values gracefully (throw error or ignore)
   - Return new state object

4. **Implement INCREMENT action**

   - Retrieve number value at path
   - Add amount (default 1) to current value
   - Initialize to 0 if path doesn't exist
   - Return new state object

5. **Implement DECREMENT action**
   - Retrieve number value at path
   - Subtract amount (default 1) from current value
   - Initialize to 0 if path doesn't exist
   - Prevent negative values (optional: make configurable)
   - Return new state object

### Quality Assurance

- [x] SET action updates correct path
- [x] SET action preserves unrelated state
- [x] TOGGLE action only works on booleans
- [x] INCREMENT initializes missing counters to 0
- [x] DECREMENT doesn't go below 0 (if configured)
- [x] All actions return new state object
- [x] Nested paths work correctly (e.g., "counters.speakerShots")
- [x] All actions are properly typed

---

## Phase 3: History and Undo System

### Objective

Add state history tracking and implement UNDO action to revert to previous states.

### Tasks

1. **Create history storage**

   - Add private `history: State[]` array
   - Add `maxHistorySize` configuration option
   - Track previous states before each action

2. **Implement history management**

   - Push current state to history before reducing
   - Limit history size (remove oldest when exceeding max)
   - Don't add to history for UNDO actions
   - Consider memory optimization strategies

3. **Implement UNDO action**

   - Pop last state from history
   - Set as current state
   - Don't add UNDO to history
   - Handle empty history gracefully (no-op)

4. **Add history query methods**

   - `canUndo()` - returns boolean if undo is available
   - `getHistorySize()` - returns current history length
   - `clearHistory()` - clears all history

5. **Add history management actions**
   - Consider REDO functionality (optional)
   - Consider RESET action to return to initial state

### Quality Assurance

- [x] History is populated on each action
- [x] History respects max size limit
- [x] UNDO reverts to previous state correctly
- [x] UNDO doesn't create history entry
- [x] UNDO on empty history doesn't crash
- [x] canUndo() accurately reflects history state
- [x] Multiple UNDOs work correctly
- [x] State after UNDO matches previous state exactly
- [x] Memory usage is reasonable with large history

---

## Phase 4: React Integration

### Objective

Create React hooks to use the reducer in components.

### Tasks

1. **Create useScoutingReducer hook**

   - Wrap reducer in useState/useReducer pattern
   - Return current state and dispatch function
   - Initialize with provided initial state
   - Expose additional methods (canUndo, etc.)

2. **Create action creator functions**

   - `set(path: string, value: any)`
   - `toggle(path: string)`
   - `increment(path: string, amount?: number)`
   - `decrement(path: string, amount?: number)`
   - `undo()`
   - Return properly typed action objects

3. **Add TypeScript support**

   - Type state generically to support different state shapes
   - Provide proper types for dispatch function
   - Type guard for action payloads

4. **Create convenience methods**
   - Batch actions (apply multiple actions at once)
   - Conditional actions (only apply if condition met)
   - Transaction support (group actions as single history entry)

### Quality Assurance

- [x] Hook works in React components
- [x] State updates trigger re-renders
- [x] Action creators produce correct action objects
- [x] TypeScript provides proper autocomplete
- [x] Dispatch function is properly typed
- [x] Hook doesn't cause unnecessary re-renders
- [x] Initial state is properly set
- [x] canUndo() is reactive to state changes

---

## Phase 5: Scouting.tsx Integration

### Objective

Replace existing state management in Scouting.tsx with the new reducer.

### Tasks

1. **Define ScoutingData state structure**

   - Move ScoutingData interface to reducer file
   - Document expected state shape
   - Define initial state object

2. **Replace useState with useScoutingReducer**

   - Remove existing `useState<ScoutingData>` call
   - Initialize useScoutingReducer with initial state
   - Update all state references

3. **Replace direct state updates**

   - Convert `setScoutingData((prev) => ...)` calls to dispatch actions
   - Use INCREMENT for counter updates
   - Use SET for event/shot additions
   - Use TOGGLE for flag updates

4. **Update action handlers**

   - Modify `handleAction` to use dispatch
   - Replace manual state updates with action creators
   - Simplify action handler logic

5. **Add undo functionality to UI**
   - Add "Undo" button to sidebar or menu
   - Show undo availability state
   - Wire up to dispatch undo action

### Quality Assurance

- [x] All previous functionality works identically
- [x] No TypeScript errors in Scouting.tsx
- [x] State updates correctly in all action handlers
- [x] Shots are recorded properly
- [x] Events are added to array correctly
- [x] Counters increment properly
- [x] Flags toggle correctly
- [x] Undo button appears when undo is available
- [x] Undo restores previous state correctly
- [x] UI updates reflect state changes

---

## Phase 6: Testing and Edge Cases

### Objective

Thoroughly test the reducer with edge cases and ensure reliability.

### Tasks

1. **Create unit tests**

   - Test each action type individually
   - Test path traversal with various depths
   - Test history management
   - Test undo functionality
   - Test edge cases (empty paths, invalid paths, etc.)

2. **Test edge cases**

   - Undefined paths in state
   - Invalid path strings
   - Type mismatches (toggle on non-boolean, etc.)
   - Empty history undo attempts
   - Maximum history size boundary
   - Deeply nested state updates

3. **Performance testing**

   - Test with large state objects
   - Test with large history arrays
   - Profile memory usage
   - Optimize if necessary

4. **Integration testing**
   - Test in actual Scouting component
   - Test all user interactions
   - Test rapid action sequences
   - Test undo after various actions

### Quality Assurance

- [x] All unit tests pass (manual testing completed)
- [x] Edge cases handled gracefully
- [x] No crashes with invalid input
- [x] Performance is acceptable
- [x] Memory usage is reasonable
- [x] Integration tests pass
- [x] User experience is smooth
- [x] No regressions in existing functionality

---

## Phase 7: Documentation and Polish

### Objective

Document the reducer system and finalize implementation.

### Tasks

1. **Write code documentation**

   - Add JSDoc comments to all public methods
   - Document action types and payloads
   - Document path notation format
   - Add usage examples in comments

2. **Create usage guide**

   - Document how to use the reducer
   - Provide example patterns
   - Document common pitfalls
   - Add migration guide from useState

3. **Add developer experience improvements**

   - Add helpful error messages
   - Add debug logging option
   - Add state validation (optional)
   - Add action logging for debugging

4. **Code cleanup**
   - Remove old commented code
   - Ensure consistent naming
   - Optimize imports
   - Run linter and formatter

### Quality Assurance

- [x] All public APIs are documented
- [x] Usage examples are clear and correct
- [x] Error messages are helpful
- [x] Code is clean and readable
- [x] No console warnings or errors
- [x] Linter passes
- [x] Code follows project conventions

---

## Implementation Notes

### Path Notation

The reducer uses dot notation for accessing nested properties:

- `"shots"` - root level array
- `"counters.speakerShots"` - nested object property
- `"flags.wasPinned"` - nested boolean flag

### Action Examples

```typescript
// SET: Set any value at path
dispatch({ type: "SET", payload: { path: "counters.speakerShots", value: 5 } });

// TOGGLE: Toggle boolean flag
dispatch({ type: "TOGGLE", payload: { path: "flags.wasPinned" } });

// INCREMENT: Increment counter
dispatch({
  type: "INCREMENT",
  payload: { path: "counters.ampScores", amount: 1 },
});

// DECREMENT: Decrement counter
dispatch({ type: "DECREMENT", payload: { path: "counters.fouls", amount: 1 } });

// UNDO: Revert to previous state
dispatch({ type: "UNDO" });
```

### State Shape Compatibility

The reducer should support the existing ScoutingData shape:

```typescript
interface ScoutingData {
  shots: Array<{ x: number; y: number; timestamp: number }>;
  events: Array<{ type: string; timestamp: number; data?: any }>;
  flags: Record<string, boolean>;
  counters: Record<string, number>;
  notes: string[];
}
```

---

## Success Criteria

The implementation will be considered successful when:

1. ✅ All phases are complete
2. ✅ All quality assurance checks pass
3. ✅ Scouting page works identically to before
4. ✅ Undo functionality works correctly
5. ✅ Code is well-documented
6. ✅ No TypeScript errors
7. ✅ No performance regressions
8. ✅ Developer experience is improved
