# How to Test Offline Mode

## Quick Test (Recommended):

1. **With internet connected**, go to `http://localhost:4173`
2. Log in and browse around (dashboard, settings, etc.)
3. Open DevTools (F12) → **Application** tab
4. Check **Service Workers** section:
   - Should show: `http://localhost:4173/sw.js` - **Activated and running**
5. Click **Cache Storage** in left sidebar
6. Expand the caches - you should see:
   - `workbox-precache-v2-http://localhost:4173/` (app shell)
   - `supabase-api` (after making API calls)
   - `tba-api` (if you loaded team data)
   - `external-images` (team photos)

## Test Offline Loading:

### Option A: DevTools Offline Checkbox
1. **Stay connected to internet**
2. In DevTools → **Network** tab
3. Check **Offline** checkbox (throttling dropdown)
4. Refresh the page (Ctrl+R)
5. **Expected:**
   - Page loads
   - Network tab shows all requests as "(ServiceWorker)"
   - App is fully functional

### Option B: Actually Disconnect (Advanced)
1. **First**, load the app while online
2. Navigate to several pages (dashboard, settings, etc.) to cache them
3. **Then** disconnect from internet (airplane mode / WiFi off)
4. Try to refresh
5. **Expected:**
   - App shell loads from cache
   - Previously visited pages work
   - API calls that were cached work
   - New API calls fail gracefully

## What Should Work Offline:

✅ **App loads** - HTML/CSS/JS from precache
✅ **Navigation** - React Router works client-side
✅ **Cached API data** - Previously fetched matches/profiles
✅ **UI interactions** - Everything local (buttons, forms, etc.)
✅ **LocalStorage** - Offline match data

## What Won't Work Offline:

❌ **New API calls** - Can't fetch new data from Supabase
❌ **Authentication** - Can't verify session (uses NetworkFirst strategy)
❌ **Image loading** - Uncached images won't load
❌ **Push notifications** - Can't register new subscriptions

## Common Scenarios:

### Scenario 1: Scout at Event (Good Connection)
- Load app at start of day
- App caches everything
- Connection drops temporarily
- **Result:** App continues working, saves to localStorage

### Scenario 2: Scout at Event (No Connection Initially)
- Try to load app
- **Result:** Won't work if never loaded before (need initial online load)

### Scenario 3: Scout During Match (Connection Lost)
- Scouting a match
- Connection drops mid-match
- Submit data
- **Result:** Saves to localStorage, shows in OfflineMatches, uploads later

## Testing the Full Flow:

1. **Online:** Open app, log in, go to dashboard
2. **Check cache:** DevTools → Application → Cache Storage (verify data)
3. **Go offline:** DevTools → Network → Offline checkbox
4. **Navigate:** Click around - Settings, Profile, Dashboard
5. **Refresh:** Page should reload from cache
6. **Go back online:** Uncheck Offline
7. **Service worker updates:** Should fetch fresh data in background

## Debug Commands (Browser Console):

```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Registered SWs:', regs);
});

// Check cache contents
caches.keys().then(names => {
  console.log('Cache names:', names);
  return Promise.all(
    names.map(name =>
      caches.open(name).then(cache =>
        cache.keys().then(keys => ({
          name,
          count: keys.length,
          keys: keys.slice(0, 5) // first 5
        }))
      )
    )
  );
}).then(console.log);

// Check online/offline status
console.log('Online:', navigator.onLine);

// Listen for online/offline events
window.addEventListener('online', () => console.log('🟢 ONLINE'));
window.addEventListener('offline', () => console.log('🔴 OFFLINE'));
```

## The "Can't Refresh Without Internet" Issue:

This might be one of these:

### Issue 1: localhost:4173 not cached
**Cause:** Preview server needs to be running
**Fix:** Keep `npm run preview` running, then test offline mode with DevTools

### Issue 2: Service worker not activated yet
**Cause:** First load, SW not ready
**Fix:**
1. Load page once while online
2. Wait for "Service worker activated" in console
3. Then test offline

### Issue 3: Hard refresh bypasses cache
**Cause:** Ctrl+Shift+R forces network
**Fix:** Use normal refresh (Ctrl+R or F5)

### Issue 4: Browser cache vs Service Worker cache
**Cause:** Confusion between the two
**Clarification:**
- **Browser cache:** HTTP cache (old school)
- **Service Worker cache:** Programmatic cache (PWA)
- Service worker overrides browser cache

## Expected Console Messages:

When the service worker is working, you should see:
```
SW registration succeeded
Service Worker activated
Workbox precaching: 10 entries
```

When you go offline (DevTools checkbox):
```
(No specific message - app just works)
Network requests show (ServiceWorker) in Network tab
```

When you try to refresh offline:
```
Precache manifest loaded
All resources loaded from cache
```

---

## TL;DR - Quick Offline Test:

1. Load `http://localhost:4173` (online)
2. Open DevTools → Network tab
3. Check "Offline" checkbox
4. Press F5 to refresh
5. App should load perfectly

If that works, your PWA is working! 🎉
