# Match Assignment Notifications

This feature automatically notifies users when they are assigned to a match.

## How It Works

### 1. Database Trigger
When a manager assigns a scout to a match (via the Manager Dashboard or direct database update), a PostgreSQL trigger fires and creates a notification record.

**Trigger Location:** `supabase/migrations/20260210_match_assignment_notifications.sql`

**What it does:**
- Monitors all 8 scouter columns on the `matches` table
- Detects when a user is newly assigned (NULL → user_id)
- Detects when assignment changes (old_user → new_user)
- Creates a record in `match_assignment_notifications` table

### 2. Real-time Subscription
The app subscribes to changes in the `match_assignment_notifications` table using Supabase Realtime.

**Hook Location:** `src/hooks/useMatchAssignmentNotifications.ts`

**What it does:**
- Listens for new assignment notifications for the current user
- When triggered:
  1. Fetches match details (match number, event name)
  2. Sends a local notification via Service Worker
  3. Shows a toast in the app
  4. Marks the notification as "notified" in the database

### 3. Global Listener Component
The `MatchAssignmentListener` component is added to the App to enable the hook globally.

**Component Location:** `src/components/MatchAssignmentListener.tsx`

**Integration:** Added to `App.tsx` alongside `Toaster` and `UpdateBanner`

## Setup Instructions

### Step 1: Run the Migration

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- Copy contents of:
-- supabase/migrations/20260210_match_assignment_notifications.sql
```

This creates:
- `match_assignment_notifications` table
- Database trigger on `matches` table
- Realtime publication for both tables

### Step 2: Enable Realtime in Supabase Dashboard

1. Go to **Database → Replication**
2. Find the `match_assignment_notifications` table
3. Toggle it **ON**
4. Find the `matches` table
5. Toggle it **ON** (if not already)

### Step 3: Rebuild and Test

```bash
npm run pwa
```

## Testing the Feature

### Test 1: Assign Yourself to a Match

1. Open the app and log in
2. Open **Supabase Dashboard → Table Editor → matches**
3. Find a match and click **Edit**
4. Set `red1_scouter_id` (or any role) to your user ID
5. Click **Save**

**Expected:**
- 🔔 Notification appears: "You've been assigned to Match X (Red 1)"
- 🍞 Toast appears in the app
- Clicking notification opens match config page

### Test 2: Manager Assigns You

1. Log in as a manager account
2. Go to `/manager` dashboard
3. Assign yourself (or another user) to a match
4. The assigned user gets a notification immediately

### Test 3: Reassignment

1. Assign user A to Red 1
2. Change Red 1 to user B
3. **Expected:** User B gets a notification (user A does not)

### Test 4: Multiple Assignments

1. Assign the same user to multiple roles in the same match
2. **Expected:** One notification per role assignment

## Notification Format

**Title:** "New Match Assignment"

**Body:** "You've been assigned to [Event Name] - Match [Number] ([Role])"

**Examples:**
- "You've been assigned to 2025 Week 1 - Match 42 (Red 1)"
- "You've been assigned to District Championship - Match 15 (Blue 2)"
- "You've been assigned to World Championship - Match 99 (Qual Red)"

**Click Action:** Opens `/config/{matchId}?role={role}`

## Database Schema

### `match_assignment_notifications` Table

```sql
CREATE TABLE match_assignment_notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  match_id UUID REFERENCES matches(id),
  role TEXT,                    -- e.g., "red1_scouter_id"
  created_at TIMESTAMPTZ,
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ
);
```

**Purpose:**
- Tracks when users are assigned to matches
- Prevents duplicate notifications (`notified` flag)
- Provides notification history

**Cleanup:**
Old notifications can be deleted via a cron job (optional):
```sql
DELETE FROM match_assignment_notifications
WHERE created_at < NOW() - INTERVAL '7 days';
```

## How Realtime Works

```
Manager assigns scout → DB trigger fires → Notification record created
                                                    ↓
                                         Supabase Realtime broadcasts
                                                    ↓
                                         App's subscription receives event
                                                    ↓
                                         Hook sends notification + toast
                                                    ↓
                                         Mark as notified in DB
```

## Settings Integration

The match assignment notifications work independently of the Settings page toggles. They are:
- **Always enabled** when user is logged in
- **Local notifications only** (don't require push server)
- **Real-time** (no polling, instant)

If you want to make them optional:
1. Add a toggle to `src/config/settings.json`
2. Check the setting in `useMatchAssignmentNotifications` hook
3. Only subscribe if setting is enabled

## Troubleshooting

### Notifications not appearing

**Check 1: Realtime enabled?**
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```
Should show both `matches` and `match_assignment_notifications`.

**Check 2: Trigger working?**
```sql
-- Manually insert a test notification
INSERT INTO match_assignment_notifications (user_id, match_id, role)
VALUES ('your-user-id', 'some-match-id', 'red1_scouter_id');
```
Should trigger the notification in the app.

**Check 3: Browser console**
Open DevTools → Console. You should see:
```
REALTIME SUBSCRIBED
```

**Check 4: Service Worker registered?**
DevTools → Application → Service Workers
Should show: `sw.js - Activated and running`

### Duplicate notifications

**Cause:** Notification marked as `notified=false` in database

**Fix:**
```sql
UPDATE match_assignment_notifications
SET notified = true
WHERE user_id = 'your-user-id';
```

### Notification appears but no sound

This is browser-dependent. Some browsers silence notifications by default.

**Firefox:** Settings → Privacy & Security → Permissions → Notifications → Settings
**Chrome:** Settings → Privacy and security → Site Settings → Notifications

## Performance Considerations

- **Realtime connections:** Each logged-in user has 1 connection for match assignments
- **Database load:** Minimal - trigger fires only on INSERT/UPDATE of matches
- **Notification records:** Consider cleanup job if you have many assignments

## Future Enhancements

Possible improvements:
1. **Batch notifications:** If assigned to 10 matches at once, show 1 notification with count
2. **Notification preferences:** Let users disable assignment notifications
3. **Email notifications:** Also send an email when assigned
4. **Summary notifications:** Daily digest of upcoming matches
5. **Unassignment notifications:** Notify when removed from a match

## Related Files

- Migration: `supabase/migrations/20260210_match_assignment_notifications.sql`
- Hook: `src/hooks/useMatchAssignmentNotifications.ts`
- Component: `src/components/MatchAssignmentListener.tsx`
- Integration: `src/App.tsx`
