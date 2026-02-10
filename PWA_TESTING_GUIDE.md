# PWA Testing Guide

## Prerequisites

1. **Generate VAPID Keys** (required for push notifications):
```bash
npx web-push generate-vapid-keys
```

Add to `.env`:
```env
VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
```

Save the private key separately - you'll need it for the Edge Function.

2. **Run migrations** in Supabase dashboard SQL Editor:
```sql
-- Run each migration file in order
-- supabase/migrations/20260210_create_push_subscriptions.sql
-- supabase/migrations/20260210_create_notification_log.sql
```

---

## Part 1: Test Basic PWA (Offline Capability)

### 1. Start the dev server
```bash
npm run dev
```

### 2. Open in Chrome
Go to `http://localhost:5173`

### 3. Check Service Worker Registration
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** (left sidebar)
4. You should see: `http://localhost:5173/sw.js` - Status: **Activated**

### 4. Check Web Manifest
1. In DevTools **Application** tab
2. Click **Manifest** (left sidebar)
3. Verify:
   - Name: "2026 Scout - FRC Scouting"
   - Start URL: "/dashboard"
   - Theme color: #0a0a0a
   - Icons: 192x192 and 512x512

### 5. Test Offline Mode
1. Make sure you're logged in and on the dashboard
2. In DevTools, go to **Network** tab
3. Check **Offline** checkbox (throttling dropdown)
4. Refresh the page
5. **Expected:** App still loads (from service worker cache)
6. Navigate to different pages - they should work
7. Uncheck **Offline** to go back online

### 6. Test PWA Installation
1. In Chrome address bar, look for the **install icon** (⊕ or computer icon)
2. Click it to install
3. **Expected:** App opens in standalone window
4. Check start menu/desktop for "2026 Scout" app icon

### 7. Check Cached Resources
1. DevTools **Application** tab → **Cache Storage**
2. Expand the caches - you should see:
   - `workbox-precache-*` (app shell JS/CSS)
   - `supabase-api` (after making API calls)
   - `tba-api` (after fetching from TBA)
   - `external-images` (team photos)

---

## Part 2: Test Push Notifications (Client Side)

### 1. Enable Notifications in Settings
1. Log in to the app
2. Go to **Settings** page
3. Under **Notifications** section:
   - Toggle **"Match Assignments"** ON
4. **Expected:** Browser prompt asking for notification permission
5. Click **Allow**
6. **Expected:** Toggle stays on, no error messages

### 2. Verify Subscription in Database
In Supabase Dashboard → **Table Editor** → `push_subscriptions`:
- Should see 1 row with your user_id
- `endpoint`, `p256dh`, and `auth` fields populated

### 3. Test Unsubscribe
1. Toggle the notification setting OFF
2. Check database - subscription should be deleted

### 4. Test Permission Denied Flow
1. In Chrome: Settings → Privacy and Security → Site Settings → Notifications
2. Block notifications for `localhost:5173`
3. Go back to app Settings page
4. **Expected:** Red warning message: "Notification permission was denied..."
5. Toggle should be disabled

---

## Part 3: Test Service Worker Update Flow

### 1. Make a Small Change
Edit `src/sw.ts` - add a comment at the top:
```typescript
// Updated version 2
```

### 2. Rebuild
```bash
npm run build
npm run preview  # Use preview instead of dev for production build
```

### 3. Open Preview
Go to `http://localhost:4173`

### 4. Trigger Update
1. In DevTools **Application** → **Service Workers**
2. Click **Update** button
3. **Expected:** New service worker appears as "waiting to activate"
4. **Expected:** After a few seconds, an update banner appears at bottom of screen:
   - "A new version is available" with **Update** button
5. Click **Update**
6. **Expected:** Page reloads with new version

---

## Part 4: Test Edge Function (Server Side)

### 1. Deploy the Edge Function

First, install Supabase CLI if you haven't:
```bash
npm install -g supabase
```

Login:
```bash
npx supabase login
```

Link to your project:
```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Deploy:
```bash
npx supabase functions deploy send-match-notifications
```

### 2. Set Edge Function Secrets
```bash
npx supabase secrets set \
  TBA_AUTH_KEY=your_tba_key \
  VAPID_SUBJECT=mailto:your@email.com \
  VAPID_PUBLIC_KEY=your_public_key \
  VAPID_PRIVATE_KEY=your_private_key
```

(Replace with your actual values from earlier)

### 3. Create Test Data

In Supabase SQL Editor:

```sql
-- Make sure you have an active event
UPDATE events SET is_active = true WHERE id = 'YOUR_EVENT_ID';

-- Make sure the event has an event_code
UPDATE events SET event_code = '2025week1' WHERE id = 'YOUR_EVENT_ID';
-- (Use a real TBA event code from https://www.thebluealliance.com/events)

-- Create a test match assigned to you
INSERT INTO matches (event_id, match_number, match_name, red1_scouter_id)
VALUES ('YOUR_EVENT_ID', 1, 'Qualification 1', 'YOUR_USER_ID');
```

### 4. Manually Invoke the Edge Function

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-match-notifications" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{"message":"Sent 0 notifications"}
```
(0 because the match isn't happening in the next 5 minutes)

### 5. Test with an Upcoming Match

The Edge Function only sends notifications for matches happening in the next 5 minutes.

**Option A: Use TBA's actual schedule** (if there's an event happening now)
- Set event_code to a real ongoing event
- Wait for matches to be within 5 minutes

**Option B: Modify the function temporarily for testing**
Edit `supabase/functions/send-match-notifications/index.ts`:
```typescript
// Change line ~40 from:
const NOTIFICATION_WINDOW_MINUTES = 5;
// To:
const NOTIFICATION_WINDOW_MINUTES = 60 * 24; // 24 hours for testing
```

Redeploy and test again:
```bash
npx supabase functions deploy send-match-notifications
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-match-notifications" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

**Expected:** Push notification appears on your device!

### 6. Verify Notification Appearance
- **Title:** "Match 1 in X min"
- **Body:** "You're scouting Red 1 - Team 254" (or whatever team is assigned)
- **Click notification:** Opens app at `/config/{match_id}?role=red1`

### 7. Check Logs
View Edge Function logs:
```bash
npx supabase functions logs send-match-notifications
```

Or in Dashboard: **Edge Functions** → select function → **Logs**

---

## Part 5: Test Notification Deduplication

1. Invoke the Edge Function twice in a row:
```bash
curl -X POST "..." -H "Authorization: Bearer ..."
curl -X POST "..." -H "Authorization: Bearer ..."
```

2. **Expected:** Only 1 notification received (not 2)

3. Check `notification_log` table in Supabase - should have 1 entry

---

## Part 6: End-to-End Test

### Complete Flow Test:

1. ✅ Install PWA on device
2. ✅ Enable push notifications in Settings
3. ✅ Manager assigns you to a match in the next 5 minutes
4. ✅ Cron triggers Edge Function
5. ✅ Push notification appears
6. ✅ Click notification → opens app to match config page
7. ✅ Scout the match
8. ✅ Go offline (airplane mode)
9. ✅ Submit match data → saves to localStorage
10. ✅ Go back online
11. ✅ Upload from OfflineMatches component

---

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Make sure you're on `http://localhost:5173` (dev server with PWA enabled)
- Try hard refresh: Ctrl+Shift+R

### Push Notifications Not Working
1. **Check VAPID key in .env:**
   ```bash
   echo $VITE_VAPID_PUBLIC_KEY
   ```
   Should not be empty

2. **Check browser permission:**
   - Chrome: `chrome://settings/content/notifications`
   - Should show localhost as "Allow"

3. **Check subscription in DB:**
   ```sql
   SELECT * FROM push_subscriptions WHERE user_id = 'YOUR_USER_ID';
   ```

4. **Check Edge Function logs:**
   ```bash
   npx supabase functions logs send-match-notifications --tail
   ```

### Icons Not Showing
- Make sure `public/icons/icon-192x192.png` and `icon-512x512.png` exist
- Rebuild: `npm run build`
- Check DevTools **Application** → **Manifest** → Icons section

### Caching Issues
Clear all caches:
1. DevTools **Application** → **Storage**
2. Click **Clear site data**
3. Reload page

---

## Production Checklist

Before deploying to production:

- [ ] Replace placeholder icons with real team logo
- [ ] Generate production VAPID keys (different from dev)
- [ ] Set up cron job in Supabase (see previous guide)
- [ ] Test on mobile devices (iOS Safari, Android Chrome)
- [ ] Test notification permissions on different browsers
- [ ] Verify offline functionality on slow/unstable connections
- [ ] Set up error monitoring for Edge Function
- [ ] Test battery impact of frequent push notifications
- [ ] Create user documentation for enabling notifications

---

## Testing on Mobile

### Android Chrome:
1. Deploy to HTTPS (required for PWA on mobile)
2. Visit site on phone
3. Chrome will show "Add to Home Screen" banner
4. Install and test notifications

### iOS Safari (16.4+):
1. Visit site in Safari
2. Tap Share button → "Add to Home Screen"
3. Open from home screen
4. Test notifications (iOS has stricter requirements)

**Note:** iOS push notifications only work on iOS 16.4+ and require HTTPS.
