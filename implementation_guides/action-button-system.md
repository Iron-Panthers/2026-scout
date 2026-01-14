# Action Button System Implementation Plan

## Overview

Implement a dynamic button system on the Scouting page that displays interactive buttons overlaid on the field when "Action" is selected. Buttons are configurable via JSON and can trigger functions or open modals with options.

---

## Phase 1: Configuration & Data Structure

### Tasks

1. **Create action buttons configuration file**

   - Create `src/config/actionButtons.json`
   - Define JSON schema for button configuration
   - Schema should include:
     - `id`: unique identifier
     - `title`: button display text
     - `x`, `y`, `w`, `h`: position and dimensions (normalized 0-1 coordinates)
     - `color`: background color (hex or CSS color)
     - `type`: "direct" or "modal"
     - `action`: function name to execute (for direct type)
     - `options`: array of modal options (for modal type)
       - Each option: `{ label: string, action: string, color?: string }`

2. **Create TypeScript interfaces**

   - Create `src/types/actionButtons.ts`
   - Define `ActionButton` interface matching JSON schema
   - Define `ModalOption` interface for modal options
   - Export types for use across components

3. **Create sample configuration**
   - Add 2-3 example buttons to JSON file
   - Include at least one "direct" and one "modal" type
   - Use realistic field positions and colors

### Quality Assurance

- [x] JSON file is valid and parsable
- [x] TypeScript interfaces correctly type the JSON structure
- [x] Sample configuration covers both button types
- [x] Normalized coordinates (0-1) are clearly documented

**Status: ✅ COMPLETE**

---

## Phase 2: Button Rendering System

### Tasks

1. **Import and parse configuration**

   - Import `actionButtons.json` in `Scouting.tsx`
   - Create state to hold parsed button configurations
   - Validate configuration on component mount

2. **Implement coordinate transformation**

   - Create helper function to transform normalized (0-1) coordinates to canvas pixels
   - Account for canvas rotation (0°, 90°, 180°, 270°)
   - Account for canvas scaling based on container size
   - Function signature: `transformButtonCoords(button, orientation, scaledWidth, scaledHeight, canvasWidth, canvasHeight)`

3. **Render buttons on canvas**

   - Add button rendering to `drawCanvas()` function
   - Only render when `selected === "action"`
   - Draw buttons as colored rectangles with text labels
   - Apply rotation transformation to button positions
   - Use `ctx.fillRect()` for button background
   - Use `ctx.fillText()` for button title
   - Add visual hover state (optional enhancement)

4. **Add button styling**
   - Implement border/shadow for better visibility
   - Center text within button rectangle
   - Ensure text is readable on colored backgrounds
   - Consider text contrast ratios

### Quality Assurance

- [x] Buttons only appear when "Action" is selected
- [x] Buttons disappear when switching to 1x/5x/10x
- [x] Button positions correctly transform with field rotation
- [x] Buttons scale proportionally with field image
- [x] Text is centered and readable
- [x] Buttons are visually distinct from shot dots

**Status: ✅ COMPLETE**

---

## Phase 3: Click Detection & Interaction

### Tasks

1. **Implement click detection**

   - Modify `handleCanvasClick()` to detect button clicks when `selected === "action"`
   - Create helper function `isClickOnButton(clickX, clickY, button, transformedCoords)`
   - Check click coordinates against all button bounds
   - Return clicked button or null

2. **Create action handler system**

   - Create `src/lib/actionHandlers.ts`
   - Define action handler registry/map
   - Implement placeholder functions for each action type
   - Function signature: `(context: ScoutingContext) => void`
   - ScoutingContext includes: shots, orientation, timestamp, etc.

3. **Handle direct actions**

   - When button with `type: "direct"` is clicked
   - Look up action function in handler registry
   - Execute function immediately
   - Provide visual feedback (flash/animation)

4. **Prevent shot recording on button clicks**
   - Ensure button clicks don't create shots
   - Early return in click handler if button was clicked
   - Maintain existing shot recording for non-button clicks

### Quality Assurance

- [x] Clicks on buttons are detected correctly
- [x] Clicks outside buttons still work normally (no shots when Action selected)
- [x] Direct action buttons execute their functions
- [x] Button clicks don't create shot markers
- [x] Click detection works across all rotations
- [x] Error handling for missing action handlers

**Status: ✅ COMPLETE**

---

## Phase 4: Modal System

### Tasks

1. **Create modal component**

   - Create `src/components/scouting/ActionModal.tsx`
   - Use shadcn Dialog component as base
   - Accept props: `isOpen`, `onClose`, `title`, `options`
   - Render list of option buttons in modal
   - Style appropriately for touch/mobile use

2. **Add modal state management**

   - Add state in `Scouting.tsx`: `modalOpen`, `modalConfig`
   - Set state when modal-type button is clicked
   - Pass state to ActionModal component
   - Handle modal close events

3. **Implement modal option handling**

   - Each modal option is a clickable button
   - Clicking option executes its action handler
   - Close modal after option is selected
   - Support optional colors for option buttons

4. **Add modal animations**
   - Smooth open/close transitions
   - Backdrop overlay with opacity transition
   - Consider mobile-friendly slide-up animation

### Quality Assurance

- [x] Modal opens when modal-type button is clicked
- [x] Modal displays correct title and options
- [x] Modal options execute correct actions
- [x] Modal closes after option selection
- [x] Modal closes when backdrop is clicked
- [x] Modal is mobile-friendly and touch-optimized
- [x] Modal works across all device orientations

**Status: ✅ COMPLETE**

---

## Phase 5: Action Handler Implementation

### Tasks

1. **Define common action handlers**

   - `logEvent`: Log event with timestamp
   - `toggleFlag`: Set boolean flag in scouting data
   - `incrementCounter`: Increment numeric counter
   - `recordNote`: Open text input for notes
   - `markPosition`: Save current position/time
   - `clearShots`: Clear all recorded shots

2. **Create scouting data context**

   - Define data structure for scouting session
   - Include: shots, events, flags, counters, notes
   - Add state management in `Scouting.tsx`
   - Pass context to action handlers

3. **Implement data persistence**

   - Store scouting data in component state
   - Prepare structure for future database save
   - Add console logging for debugging
   - Consider local storage backup

4. **Add undo functionality (optional)**
   - Track action history
   - Implement undo button
   - Restore previous state

### Quality Assurance

- [x] All defined action handlers work correctly
- [x] Actions update scouting data state
- [x] Action results are visible/verifiable
- [x] Data structure is logical and extensible
- [x] Console logs confirm actions are executing
- [x] No data loss between actions

---

## Phase 6: Configuration & Testing

### Tasks

1. **Create comprehensive button configurations**

   - Add buttons for common FRC actions:
     - Speaker scoring zones
     - Amp scoring
     - Climbing zones
     - Starting positions
     - Defense events
   - Position buttons on appropriate field areas
   - Use intuitive colors and labels

2. **Add configuration validation**

   - Validate JSON structure on load
   - Check for required fields
   - Validate coordinate ranges (0-1)
   - Validate color formats
   - Log warnings for invalid configs

3. **Create documentation**

   - Document JSON configuration format
   - Provide examples of each button type
   - Document available action handlers
   - Create guide for adding new actions

4. **Test across scenarios**
   - Test with multiple buttons
   - Test overlapping buttons
   - Test edge cases (buttons at field edges)
   - Test rapid clicking
   - Test rotation changes with modal open

### Quality Assurance

- [ ] Configuration loads without errors
- [ ] Invalid configurations are caught and logged
- [ ] All buttons are positioned correctly on field
- [ ] Button labels are clear and readable
- [ ] System handles edge cases gracefully
- [ ] Documentation is clear and complete
- [ ] System performs well with 10+ buttons

---

## Phase 7: Polish & Optimization

### Tasks

1. **Visual enhancements**

   - Add hover effects for buttons
   - Add pressed/active states
   - Improve text contrast
   - Add icons to buttons (optional)
   - Smooth transitions when switching modes

2. **Performance optimization**

   - Optimize canvas redraw on button interactions
   - Debounce/throttle click handlers if needed
   - Minimize re-renders
   - Profile performance with many buttons

3. **Accessibility improvements**

   - Ensure buttons have appropriate touch targets (min 44x44px)
   - Add keyboard navigation support
   - Improve color contrast for accessibility
   - Add ARIA labels to interactive elements

4. **Error handling**
   - Handle missing configuration gracefully
   - Handle invalid action handlers
   - Add error boundaries
   - Provide user-friendly error messages

### Quality Assurance

- [ ] Visual polish meets design standards
- [ ] Performance is smooth even with many buttons
- [ ] Touch targets are appropriately sized
- [ ] Keyboard navigation works
- [ ] Errors are handled gracefully
- [ ] User experience is intuitive and responsive

---

## Final Acceptance Criteria

### Functionality

- ✓ Buttons appear only when "Action" is selected
- ✓ Buttons are positioned correctly on field across all rotations
- ✓ Direct action buttons execute functions immediately
- ✓ Modal buttons open modal with options
- ✓ Modal options execute correct actions
- ✓ Buttons are configurable via JSON
- ✓ No shots recorded on button clicks

### Configuration

- ✓ JSON configuration is well-structured and documented
- ✓ Easy to add new buttons without code changes
- ✓ Easy to add new action handlers with code changes
- ✓ Configuration validation catches errors

### User Experience

- ✓ Visual design is clear and intuitive
- ✓ Touch/click interactions feel responsive
- ✓ System works across all device orientations
- ✓ Performance is smooth and lag-free

### Code Quality

- ✓ TypeScript types are comprehensive
- ✓ Code is modular and maintainable
- ✓ Documentation is complete
- ✓ Error handling is robust

---

## Future Enhancements

- Dynamic button visibility based on game state
- Button animations and visual feedback
- Custom button shapes (circles, polygons)
- Button grouping/categories
- Conditional button display rules
- Button templates for common FRC games
- Export/import button configurations
- Visual button editor tool
