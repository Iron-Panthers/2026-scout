# Game Shop System — Implementation Plan

**Feature:** An in-app economy where scouts earn/spend points to unlock mini-games playable between matches.

**Scope:** New `game_profiles` Supabase table, static game catalog config, purchase flow, locked/unlocked game grid UI in the existing Games tab of `ScoutConfig`, and a full-screen iframe game player.

---

## Architecture Overview

### Data Storage Strategy
- **Game catalog** is stored as a **static TypeScript config file** (`src/config/games.ts`). Games are just iframes — there's no need for a dynamic DB table for the catalog itself.
- **User economy** is stored in a new `game_profiles` Supabase table with `points` and `unlocked_games` (text array of game IDs).
- This means adding/removing games is a code change, not a DB migration.

### Game Data Shape
```ts
interface GameDefinition {
  id: string;           // e.g. "tetris"
  name: string;         // e.g. "Tetris"
  description: string;  // Short 1-sentence description
  cost: number;         // Points to unlock
  iframeUrl: string;    // Full URL to the embeddable game
  thumbnailUrl: string; // Preview image (can be placeholder)
}
```

### Economy Flow
1. Users start with **0 points**.
2. Points are awarded by managers (Phase 1 scope); earning via scouting submissions is a stretch goal (Phase 5).
3. When a user clicks a locked game and confirms purchase: deduct `cost` from `points` and push the game `id` into `unlocked_games`.
4. When a user clicks an unlocked game: render a full-screen iframe overlay.

---

## Phase 1: Database Schema & Types ✅ COMPLETE

### Todos
- [x] Create migration file `supabase/migrations/20260226020_create_game_profiles.sql`
  - Table: `game_profiles`
    - `id` UUID PK default `gen_random_uuid()`
    - `user_id` UUID NOT NULL UNIQUE REFERENCES `auth.users(id)` ON DELETE CASCADE
    - `points` INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
    - `unlocked_games` TEXT[] NOT NULL DEFAULT '{}'
    - `created_at` TIMESTAMPTZ DEFAULT now()
    - `updated_at` TIMESTAMPTZ DEFAULT now()
  - Enable RLS
  - Policy: Users can SELECT their own row
  - Policy: Users can UPDATE their own row (only `points` and `unlocked_games` — enforce via column-level permissions or CHECK)
  - Policy: Managers can SELECT any row (for leaderboard / award points)
  - Policy: Managers can UPDATE any row's `points` (to award points)
  - Auto-insert row on new profile creation (trigger or handled in app code)
  - Index on `user_id`

- [x] Add `GameProfile` and `GameDefinition` interfaces to `src/types/index.ts`

### QA Checks
- [ ] **MANUAL** Open Supabase table editor and verify `game_profiles` table exists with all columns and constraints
- [ ] **MANUAL** Verify RLS is enabled on the table (row-level security badge shows "enabled")
- [ ] **MANUAL** Test in Supabase SQL editor: insert a row for a test user, SELECT it back, confirm `points >= 0` constraint rejects negative values
- [ ] **MANUAL** Confirm `unlocked_games` column defaults to empty array `{}`
- [x] TypeScript compiles with `GameProfile` interface — `vite build` passes ✅

---

## Phase 2: Game Catalog Config & Data Library ✅ COMPLETE

### Todos
- [x] Create `src/config/games.ts` — 4 games: 2048 (free), Tetris (100pts), Block Blast (150pts), Subway Surfers (200pts)
- [x] Export `POINTS_PER_MATCH = 25` constant for future auto-award use
- [x] Create `src/lib/gameProfiles.ts` — `getGameProfile`, `purchaseGame`, `awardPoints`
  - `getGameProfile` auto-creates row on PGRST116 (no row found)
  - `purchaseGame` guards: already-owned, insufficient points, Supabase error
  - `awardPoints` for manager use

### QA Checks
- [x] No duplicate game IDs in `GAMES` array (verified: 2048, tetris, block-blast, subway-surfers) ✅
- [x] No TypeScript errors in new files (`tsc --noEmit --skipLibCheck` passes) ✅
- [x] `vite build` passes cleanly ✅
- [ ] **MANUAL** `getGameProfile` auto-creates row in DB on first call for a new user
- [ ] **MANUAL** `purchaseGame` with insufficient points returns correct error message
- [ ] **MANUAL** `purchaseGame` called twice for same game returns "already own" error

---

## Phase 3: Game Shop UI (Games Tab) ✅ COMPLETE

### Todos
- [x] Create `src/components/GameCard.tsx` — locked (45% opacity + Lock icon overlay) vs unlocked (CheckCircle badge + Play hover overlay), thumbnail with error fallback, cost/free/owned badge
- [x] Create `src/components/GamePurchaseDialog.tsx` — shows cost & balance rows with Coins icon, disabled confirm when can't afford, loading state, error display
- [x] Update `src/pages/ScoutConfig.tsx` — replaced `:skull:` placeholder with points header + 2-column skeleton/grid, purchase dialog wired, game player wired

### QA Checks
- [x] Build passes with no errors in modified files ✅
- [x] No TypeScript errors in GameCard, GamePurchaseDialog, ScoutConfig (`tsc --noEmit --skipLibCheck`) ✅
- [ ] **MANUAL** Games tab renders without crashing when `game_profiles` row doesn't yet exist
- [ ] **MANUAL** All 4 games display in 2-column grid on mobile
- [ ] **MANUAL** Locked games appear dimmed with lock icon; unlocked games appear at full opacity
- [ ] **MANUAL** Clicking a locked game opens the purchase dialog with correct cost/balance
- [ ] **MANUAL** "Confirm Purchase" is disabled when `points < cost`
- [ ] **MANUAL** After purchase, card updates to unlocked state and points balance decrements
- [ ] **MANUAL** Clicking an unlocked game does NOT open the purchase dialog

---

## Phase 4: Full-Screen Game Player ✅ COMPLETE

### Todos
- [x] Create `src/components/GamePlayer.tsx` — `fixed inset-0 z-[9999]` overlay, null-guard renders nothing, `<iframe>` with `allow="fullscreen; autoplay"` and `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"`, semi-transparent pill Back button top-left with backdrop-blur
- [x] Wired into `ScoutConfig.tsx` — `activeGame` state, `onPlay={() => setActiveGame(game)}` on GameCard, `<GamePlayer game={activeGame} onClose={() => setActiveGame(null)} />` outside tabs

### QA Checks
- [x] Build passes cleanly ✅
- [ ] **MANUAL** Clicking an unlocked game renders a full-screen iframe covering the entire viewport
- [ ] **MANUAL** "Back" pill button visible at top-left corner over the iframe content
- [ ] **MANUAL** Clicking "Back" closes the player and returns to the games tab
- [ ] **MANUAL** `z-[9999]` ensures Back button is not obscured by iframe content
- [ ] **MANUAL** No JS errors in console when opening/closing the player

---

## Phase 5: Points Awarding UI (Manager) ✅ COMPLETE

### Todos
- [x] Added "Points" tab to `ManagerDashboard.tsx` — new 7th tab (desktop grid-cols-7), mobile select entry, and TabsContent
  - Scout selector dropdown using existing `availableScouts: Profile[]` state
  - Numeric point input with Coins icon
  - Award button: disabled when no scout/amount selected or loading
  - Success/error toast on completion via `useToast`
  - Calls `awardPoints(targetUserId, amount)` from `src/lib/gameProfiles.ts`
- [ ] (Stretch) Auto-award points on scouting submission — not yet implemented
- [ ] (Stretch) Points leaderboard — not yet implemented

### QA Checks
- [x] Build passes cleanly — no errors in ManagerDashboard ✅
- [x] No TypeScript errors in ManagerDashboard (`tsc --noEmit --skipLibCheck`) ✅
- [ ] **MANUAL** Points tab appears in manager dashboard (both mobile dropdown and desktop tabs)
- [ ] **MANUAL** Manager can select a scout, enter an amount, and click Award Points
- [ ] **MANUAL** Success toast shows after awarding; scout's games tab balance increases
- [ ] **MANUAL** Non-manager users are already blocked by ProtectedRoute — confirm they cannot access /manager

---

## Files To Create / Modify (Summary)

| Action | File | Status |
|--------|------|--------|
| CREATE | `supabase/migrations/20260226020_create_game_profiles.sql` | ✅ Done |
| CREATE | `src/config/games.ts` | ✅ Done |
| CREATE | `src/lib/gameProfiles.ts` | ✅ Done |
| CREATE | `src/components/GameCard.tsx` | ✅ Done |
| CREATE | `src/components/GamePurchaseDialog.tsx` | ✅ Done |
| CREATE | `src/components/GamePlayer.tsx` | ✅ Done |
| MODIFY | `src/types/index.ts` — added `GameProfile` and `GameDefinition` | ✅ Done |
| MODIFY | `src/pages/ScoutConfig.tsx` — replaced games tab placeholder | ✅ Done |
| MODIFY | `src/pages/ManagerDashboard.tsx` — added Points tab | ✅ Done |

---

## Notes & Constraints

- **iframe URLs**: Placeholder URLs will be used until real embeddable game links are confirmed. The `GameDefinition.iframeUrl` field accepts any URL.
- **Security**: iframe gets `sandbox="allow-scripts allow-same-origin allow-popups"` to prevent top-level navigation hijacking.
- **Offline**: `gameProfile` data requires network access. The games tab should show a graceful "offline" state if Supabase is unreachable, rather than crashing.
- **No emoji**: Use lucide-react icons (`Lock`, `Play`, `ChevronLeft`, `CheckCircle`, `Coins`) instead of emoji.
- **No gradient overuse**: Cards use standard `bg-card` + `border` styling consistent with the rest of the app.
- **TypeScript strictness**: The project has pre-existing TS errors; do not introduce new ones in files we create/touch.
