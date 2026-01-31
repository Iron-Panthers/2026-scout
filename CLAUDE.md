# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

2026-scout is a FIRST Robotics Competition (FRC) scouting application built with React, TypeScript, Vite, and Supabase. It enables teams to collect match data, assign scouts to matches, and review scouting information across events.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Environment Setup

Required environment variables in `.env`:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_TBA_AUTH_KEY` - The Blue Alliance API authentication key

## Architecture

### Authentication & Authorization

The app uses Supabase Auth with a context-based authentication system:
- `AuthContext` (`src/contexts/AuthContext.tsx`) manages user authentication state, session, and profile
- `ProtectedRoute` component wraps routes requiring authentication
- Profiles support three roles: `scout`, `manager`, `admin`
- Manager routes use `requireManager={true}` prop on ProtectedRoute

### State Management

The codebase uses a custom **State Reducer System** for complex state management:
- Located in `src/lib/ScoutingReducer.ts` and `src/lib/useScoutingReducer.ts`
- Provides built-in actions: SET, TOGGLE, INCREMENT, DECREMENT, UNDO
- Uses path-based updates with dot notation (e.g., `increment("counters.speakerShots")`)
- Full undo/redo history with configurable size (default 50 states)
- Replaces traditional useState patterns for scouting state

**Usage pattern:**
```typescript
const { state, set, increment, toggle, undo, canUndo } = useScoutingReducer(initialState);
increment("counters.shots");  // Increment counter
toggle("flags.isActive");      // Toggle boolean
undo();                        // Revert last action
```

See `docs/state-reducer-usage.md` for comprehensive usage guide.

### Routing & Pages

Main routes configured in `src/App.tsx`:
- `/login` - Authentication page
- `/dashboard` - Scout dashboard (default landing)
- `/manager` - Manager dashboard (requires manager role)
- `/profile` - User profile
- `/settings` - App settings
- `/pit-scouting` - Pit scouting form
- `/config/:match_id?` - Match configuration
- `/scouting/:team/:role` - Active scouting interface
- `/review/:encoded` - Review scouting data
- `/dev` - Development/testing page

### Scouting System

**Match Phases:**
The scouting flow tracks data across game phases defined in `ScoutingReducer.ts`:
- `auto` - Autonomous period
- `transition-shift` - Transition between auto and teleop
- `phase1`, `phase2`, `phase3`, `phase4` - Teleop phases
- `endgame` - End game period

**Data Structure:**
Each match tracks:
- `shots`: Coordinate-based shot tracking per phase (x, y, timestamp)
- `counters`: Numeric counters per phase (e.g., climb levels, trench shots)
- `comments`, `errors`, `defenseDescription`: Text fields
- `currentPhase`: Active game phase

**Action Button System:**
The scouting interface supports dynamic action buttons (`implementation_guides/action-button-system.md`):
- Configured via JSON in `src/config/` (or similar)
- Two button types: "direct" (immediate action) and "modal" (shows options)
- Positioned using normalized coordinates (0-1) on field canvas
- Coordinates transform based on field rotation (0°, 90°, 180°, 270°)
- Rendered on `ScoutingCanvas` when "Action" mode is selected

### UI Components

Uses shadcn/ui component library (Radix UI + Tailwind CSS):
- Components located in `src/components/ui/`
- Configured via `components.json`
- Styling with Tailwind CSS v4 (using `@tailwindcss/vite`)

### Database

Supabase backend with tables:
- `profiles` - User profiles with role-based access
- `events` - Competition events (with TBA event codes)
- `matches` - Match records with scout assignments per role
- `scouting_submissions` - Submitted scouting data with schema versioning
- Scout assignments use fields like `red1_scouter_id`, `blue2_scouter_id`, etc.

Database migrations in `supabase/migrations/`.

### Offline Storage System

The app includes a robust offline storage system for scouting data:

**Auto-Save on Review:**
- When users reach the review page, match data is automatically saved to localStorage
- Serves as a failsafe backup if internet connection is lost during submission
- Saved data includes: event code, match number, role, scouter ID, and full scouting data

**Offline Match Management:**
- Dashboard displays all offline matches in the `OfflineMatches` component
- Shows pending vs uploaded status with visual indicators
- Verifies against database to ensure accuracy
- Network status awareness (online/offline indicators)
- Storage quota warnings when approaching localStorage limits

**Upload Functionality:**
- Individual match upload - manually upload specific matches
- Batch upload - upload all pending matches at once
- Automatic match_id resolution when missing
- Disabled when offline (requires internet connection)

**Key Files:**
- `src/lib/offlineStorage.ts` - Core offline storage service
- `src/components/OfflineMatches.tsx` - Dashboard UI component
- `src/hooks/useOnlineStatus.ts` - Network status detection hook

**Storage Structure:**
```typescript
{
  version: 1,
  matches: {
    "eventCode_matchNumber_role_timestamp": {
      eventCode: string,
      matchNumber: number,
      role: string,
      scoutingData: any,
      uploaded: boolean,
      timestamp: number,
      // ... other metadata
    }
  }
}
```

**Usage:**
```typescript
import { saveOfflineMatch, getOfflineMatches, markAsUploaded } from '@/lib/offlineStorage';

// Save a match
const key = saveOfflineMatch(eventCode, matchNumber, role, scoutingData, {
  matchId,
  eventId,
  scouterId,
});

// Get all offline matches
const matches = getOfflineMatches();

// Mark as uploaded after successful submission
markAsUploaded(key);
```

### Key Files

- `src/lib/supabase.ts` - Supabase client initialization
- `src/lib/blueAlliance.ts` - The Blue Alliance API integration
- `src/lib/profiles.ts` - Profile management functions
- `src/lib/matches.ts` - Match data operations
- `src/types/index.ts` - Core TypeScript type definitions
- `src/types/actionButtons.ts` - Action button type definitions

## Implementation Notes

### Adding New Features

When adding scouting features:
1. Use the State Reducer System for complex state (not raw useState)
2. Add new counter names to `COUNTER_NAMES` array in `ScoutingReducer.ts`
3. Initialize state using `ScoutingReducer.createInitialState(matchId, role)`
4. Use path notation for nested updates: `increment("counters.phase1.newCounter")`

### Action Handlers

When adding new action buttons:
1. Define button in JSON config with position, color, type
2. Create action handler in `src/lib/actionHandlers.ts` (if exists)
3. Register handler in action registry
4. Handler receives full scouting context (state, shots, orientation, etc.)

### Coordinate Transformations

Field canvas supports rotation. When working with coordinates:
- Store positions as normalized (0-1) coordinates
- Transform based on `orientation` state (0, 90, 180, 270 degrees)
- Account for both rotation and scaling when rendering/detecting clicks

### Role-Based Access

When adding manager-only features:
- Check `profile.is_manager` or `profile.role === 'manager'`
- Use `ProtectedRoute` with `requireManager={true}`
- Manager dashboard is separate from scout dashboard

## Testing & Development

- Development page at `/dev` for testing features
- Use browser DevTools for debugging Supabase queries
- Check browser console for state reducer action logs
