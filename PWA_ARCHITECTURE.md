# PWA Architecture Overview - 2026 Scout

A comprehensive guide to how the Progressive Web App, offline functionality, and notification systems work together.

---

## 🎯 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER'S DEVICE                            │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    REACT APPLICATION                        │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │ │
│  │  │  Dashboard   │  │   Settings   │  │  Match Config   │  │ │
│  │  │  (UI Layer)  │  │  (UI Layer)  │  │   (UI Layer)    │  │ │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │ │
│  │         │                  │                   │            │ │
│  │         └──────────────────┴───────────────────┘            │ │
│  │                            │                                │ │
│  │  ┌─────────────────────────▼────────────────────────────┐  │ │
│  │  │           HOOKS & STATE MANAGEMENT LAYER             │  │ │
│  │  │  • useMatchAssignmentNotifications (Realtime)        │  │ │
│  │  │  • usePushNotifications (Subscription)               │  │ │
│  │  │  • useOnlineStatus (Network detection)               │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  │                            │                                │ │
│  │  ┌─────────────────────────▼────────────────────────────┐  │ │
│  │  │              CLIENT LIBRARIES LAYER                   │  │ │
│  │  │  • pushNotifications.ts (Web Push API)               │  │ │
│  │  │  • offlineStorage.ts (LocalStorage)                  │  │ │
│  │  │  • swRegistration.ts (Service Worker)                │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    SERVICE WORKER (sw.js)                  │ │
│  │  • Caching Strategy (Workbox)                             │ │
│  │  • Push Event Handler                                     │ │
│  │  • Notification Click Handler                             │ │
│  │  • Background Sync (future)                               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             │ HTTPS
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                      SUPABASE BACKEND                             │
│                                                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │
│  │   PostgreSQL    │  │  Realtime Server │  │  Edge Functions │ │
│  │   Database      │  │  (WebSocket)     │  │  (Deno Runtime) │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────┘ │
│           │                    │                      │           │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐ │
│  │  Tables:        │  │  Publications:  │  │  Functions:     │ │
│  │  • matches      │  │  • matches      │  │  • send-match-  │ │
│  │  • push_subs    │  │  • match_notif  │  │    notifications│ │
│  │  • notif_log    │  │                 │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│           │                                          │           │
│  ┌────────▼──────────────────────────────────────────▼────────┐ │
│  │               DATABASE TRIGGERS                            │ │
│  │  • notify_match_assignment() - Fires on match UPDATE       │ │
│  │    → Creates record in match_assignment_notifications      │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
                             │
                             │ HTTPS (Web Push Protocol)
                             ▼
┌────────────────────────────────────────────────────────────────┐
│              WEB PUSH SERVICE (Browser Vendor)                 │
│  • Chrome: Google FCM                                          │
│  • Firefox: Mozilla AutoPush                                   │
│  • Safari: Apple Push Notification service                     │
└────────────────────────────────────────────────────────────────┘
```

---

## 📦 Component Breakdown

### 1. **Progressive Web App (PWA) Foundation**

#### What is it?
A PWA makes your web app behave like a native mobile app - installable, offline-capable, and fast.

#### Key Files:
- **`vite.config.ts`** - PWA configuration
- **`public/manifest.webmanifest`** (auto-generated) - App metadata
- **`src/sw.ts`** - Service worker source code

#### How it works:
```javascript
// vite.config.ts
VitePWA({
  strategies: "injectManifest",  // Use custom service worker
  registerType: "prompt",         // User controls updates
  manifest: {
    name: "2026 Scout",
    icons: [...],                 // App icons
    display: "standalone",        // Hide browser UI
    start_url: "/dashboard"       // Entry point
  }
})
```

**Build Process:**
1. Vite compiles `src/sw.ts` → `dist/sw.js`
2. VitePWA plugin injects precache manifest into service worker
3. Generates `manifest.webmanifest` with app metadata
4. User can "Add to Home Screen" on mobile

---

### 2. **Service Worker (Caching Layer)**

#### What is it?
A background script that runs independently of the web page, intercepting network requests and managing caching.

#### File: `src/sw.ts`

#### Architecture:

```javascript
// Service Worker Lifecycle
Install → Activate → Fetch (intercept requests) → Push (receive notifications)
```

#### Caching Strategies:

| Resource | Strategy | Cache Name | TTL | Why |
|----------|----------|------------|-----|-----|
| **App Shell** | Precache | `workbox-precache` | Forever | HTML/CSS/JS must always work offline |
| **Supabase REST** | StaleWhileRevalidate | `supabase-api` | 24h | Fast load, update in background |
| **Supabase Auth** | NetworkFirst | `supabase-auth` | 1h | Auth tokens must be fresh |
| **TBA API** | CacheFirst | `tba-api` | 30min | Match data stable, but can shift |
| **Team Photos** | CacheFirst | `external-images` | 7 days | Images rarely change |

#### Code Example:

```typescript
// StaleWhileRevalidate: Serve cached, fetch fresh in background
registerRoute(
  ({ url }) => url.pathname.startsWith("/rest/"),
  new StaleWhileRevalidate({
    cacheName: "supabase-api",
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 })
    ]
  })
);
```

**Flow:**
1. User visits `/dashboard`
2. App fetches match data from Supabase
3. Service worker intercepts request
4. If cached → serve immediately
5. Fetch fresh data in background
6. Update cache for next time

---

### 3. **Service Worker Registration & Updates**

#### File: `src/lib/swRegistration.ts`

#### Purpose:
Manages service worker lifecycle - registration, updates, and version control.

#### Flow:

```
App Loads
   │
   ├─> registerSW() called from main.tsx
   │
   ├─> navigator.serviceWorker.register('/sw.js')
   │
   ├─> Service Worker installs
   │       │
   │       ├─> Precaches app shell (HTML, CSS, JS)
   │       └─> Activates
   │
   ├─> App subscribes to 'updatefound' event
   │
   └─> New SW version detected
         │
         ├─> Dispatch 'sw-update-available' event
         │
         └─> UpdateBanner shows "New version available"
               │
               └─> User clicks "Update"
                     │
                     ├─> applyUpdate() sends SKIP_WAITING message
                     └─> Page reloads with new version
```

**Why `registerType: "prompt"`?**
- Scouts can't have app auto-reload mid-match
- Banner prompts user to update at their convenience
- Critical for FRC competition environment

---

### 4. **Push Notification System (2 Types)**

---

## 🔔 Type 1: Match Assignment Notifications (Real-time)

**Trigger:** Manager assigns scout to a match
**Mechanism:** Supabase Realtime (WebSocket)
**Latency:** ~1-2 seconds

### Architecture:

```
Manager Dashboard
   │
   └─> Updates match.red1_scouter_id = 'user-123'
         │
         ├─> PostgreSQL UPDATE statement
         │
         └─> Database Trigger: notify_match_assignment()
               │
               ├─> INSERT INTO match_assignment_notifications
               │     (user_id, match_id, role, notified=false)
               │
               └─> Supabase Realtime broadcasts INSERT event
                     │
                     ├─> WebSocket message to all subscribed clients
                     │
                     └─> Scout's Browser (if app is open)
                           │
                           └─> useMatchAssignmentNotifications hook
                                 │
                                 ├─> Receives INSERT event
                                 │
                                 ├─> Fetches match details
                                 │
                                 ├─> Shows notification via Service Worker
                                 │
                                 └─> Marks as notified in DB
```

### Database Trigger Code:

```sql
CREATE TRIGGER on_match_assignment
  AFTER INSERT OR UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_assignment();
```

**What it does:**
- Monitors 8 scouter columns (red1, red2, red3, blue1, etc.)
- Detects when NULL → user_id (new assignment)
- Creates notification record
- Realtime broadcasts to subscribed clients

### React Hook: `useMatchAssignmentNotifications`

```typescript
useEffect(() => {
  const channel = supabase
    .channel("match-assignments")
    .on("postgres_changes", {
      event: "INSERT",
      table: "match_assignment_notifications",
      filter: `user_id=eq.${user.id}`
    }, async (payload) => {
      // New assignment for this user!
      await sendPushNotification(payload.match_id, payload.role);
      await markAsNotified(payload.id);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [user.id]);
```

**Flow on page load:**
1. Hook subscribes to Realtime
2. Checks for unnotified assignments in DB
3. Sends notifications for any missed while offline
4. Marks them as notified
5. Listens for new assignments via WebSocket

**Advantages:**
- Instant (1-2 second latency)
- Works when app is open
- No server polling
- Efficient (WebSocket connection)

**Limitations:**
- Only works when app is open/active
- Doesn't wake app if closed

---

## 🔔 Type 2: Match Reminder Notifications (Server-side Push)

**Trigger:** Cron job checks TBA API for upcoming matches
**Mechanism:** Web Push Protocol (server → browser)
**Latency:** Up to 2 minutes (cron interval)

### Architecture:

```
Supabase pg_cron (every 2 minutes)
   │
   └─> Calls Edge Function: send-match-notifications
         │
         ├─> Query active events
         │
         ├─> For each event:
         │     │
         │     ├─> Fetch matches from TBA API
         │     │     GET /event/{code}/matches
         │     │     → Returns predicted_time for each match
         │     │
         │     ├─> Filter matches: now < time < now+5min
         │     │
         │     └─> For each upcoming match:
         │           │
         │           ├─> Query DB for assigned scouts
         │           │
         │           ├─> Check notification_log (prevent duplicates)
         │           │
         │           ├─> Fetch push_subscriptions for each scout
         │           │
         │           └─> Send Web Push notification
         │                 │
         │                 └─> Uses web-push library with VAPID keys
         │
         └─> Push Notification Service (Google/Mozilla/Apple)
               │
               └─> Scout's Browser (even if app is closed!)
                     │
                     └─> Service Worker: 'push' event
                           │
                           ├─> Parse notification payload
                           │
                           └─> showNotification(title, body, data)
                                 │
                                 └─> User clicks notification
                                       │
                                       └─> Service Worker: 'notificationclick' event
                                             │
                                             └─> Open app at /config/{matchId}
```

### Push Subscription Flow:

```
User visits Settings
   │
   └─> Toggles "Match Notifications" ON
         │
         ├─> Browser shows permission prompt
         │     "Allow notifications?"
         │
         └─> User clicks "Allow"
               │
               ├─> Browser requests PushSubscription
               │     from PushManager
               │     (includes endpoint, keys)
               │
               └─> subscribeToPush(userId)
                     │
                     ├─> Insert into push_subscriptions table
                     │     { user_id, endpoint, p256dh, auth }
                     │
                     └─> Subscription stored in Supabase
```

**Subscription Object:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BH7x...",  // Public key for encryption
    "auth": "abc123..."   // Authentication secret
  }
}
```

### Edge Function Code (Simplified):

```typescript
// Query matches from TBA
const tbaMatches = await fetch(
  `https://thebluealliance.com/api/v3/event/${eventCode}/matches`
);

// Find matches in 5-minute window
const upcoming = tbaMatches.filter(m => {
  const time = m.predicted_time || m.time;
  return time >= now && time <= now + 300;
});

// For each match, send notifications
for (const match of upcoming) {
  const scouts = getAssignedScouts(match);

  for (const scout of scouts) {
    const subs = await getSubscriptions(scout.userId);

    for (const sub of subs) {
      await webpush.sendNotification(sub, {
        title: `Match ${match.number} in 5 min`,
        body: `You're scouting ${scout.role}`,
        data: { url: `/config/${match.id}` }
      });
    }
  }
}
```

### Web Push Protocol (Under the Hood):

```
Edge Function
   │
   └─> webpush.sendNotification(subscription, payload)
         │
         ├─> Encrypt payload with subscription keys
         │
         ├─> Sign with VAPID keys (proves identity)
         │
         └─> HTTP POST to subscription.endpoint
               │
               └─> Push Service (Google FCM / Mozilla AutoPush)
                     │
                     ├─> Validates VAPID signature
                     │
                     ├─> Queues message for device
                     │
                     └─> Delivers to browser (even if app closed)
                           │
                           └─> Browser wakes Service Worker
                                 │
                                 └─> Dispatches 'push' event
```

**VAPID Keys:**
- **Public key** (in client): Used to subscribe
- **Private key** (server only): Used to sign push messages
- Proves the server is authorized to send pushes

**Advantages:**
- Works when app is closed
- Reliable delivery
- Battery efficient (OS handles wake-up)

**Limitations:**
- Requires server-side infrastructure (Edge Function)
- 2-minute latency (cron interval)
- iOS requires 16.4+ and HTTPS

---

## 🗄️ Database Schema

### `push_subscriptions`
Stores Web Push subscription endpoints for server-side notifications.

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,        -- Push service URL
  p256dh TEXT NOT NULL,           -- Encryption public key
  auth TEXT NOT NULL,             -- Auth secret
  created_at TIMESTAMPTZ
);
```

### `match_assignment_notifications`
Tracks real-time assignment notifications.

```sql
CREATE TABLE match_assignment_notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  match_id UUID REFERENCES matches(id),
  role TEXT,                      -- e.g., "red1_scouter_id"
  notified BOOLEAN DEFAULT false, -- Prevents duplicates
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

### `notification_log`
Prevents duplicate match reminder notifications.

```sql
CREATE TABLE notification_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  notification_tag TEXT,          -- e.g., "match-2025week1-42"
  sent_at TIMESTAMPTZ,
  UNIQUE(user_id, notification_tag)
);
```

---

## 🔄 Offline Strategy

### LocalStorage Layer (`offlineStorage.ts`)

**Purpose:** Backup scouting data when internet is unavailable.

```typescript
interface OfflineMatchData {
  matchId: string;
  eventCode: string;
  matchNumber: number;
  scoutingData: any;  // Full match data
  uploaded: boolean;
  timestamp: number;
}
```

**Flow:**
1. Scout fills out match form
2. Clicks "Submit"
3. If online → POST to Supabase
4. If offline → Save to localStorage
5. Dashboard shows "Offline Matches" component
6. When back online → Upload button sends to Supabase

### Service Worker Caching

**Purpose:** Keep app functional offline.

**What's cached:**
- **Precache** (install time): All JS/CSS/HTML
- **Runtime** (on-demand): API responses, images

**Cache hierarchy:**
```
1. Service Worker precache (app shell)
2. Service Worker runtime cache (API data)
3. LocalStorage (match data backup)
4. IndexedDB (future: large datasets)
```

---

## 🎛️ Settings Integration

### File: `src/pages/Settings.tsx`

**Notification Toggles:**
- **Match Assignments** → Enables real-time subscription
- **Match Reminders** → Controls server-side push

**Flow:**
```javascript
const { toggleNotifications } = usePushNotifications();

<Switch
  checked={settings["match-notifications"]}
  onCheckedChange={async (checked) => {
    if (checked) {
      const success = await toggleNotifications(true);
      if (!success) {
        // Permission denied - revert toggle
        updateSetting("match-notifications", false);
      }
    } else {
      await toggleNotifications(false);
    }
  }}
/>
```

**Permission States:**
- `"default"` → Not asked yet
- `"granted"` → User allowed
- `"denied"` → User blocked (show warning)

---

## 🔐 Security Considerations

### VAPID Keys
- **Public key**: Safe to expose (in client .env)
- **Private key**: SECRET (Supabase Edge Function secrets only)
- Never commit private key to git!

### Row Level Security (RLS)
```sql
-- Users can only see their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);
```

### Service Worker Security
- Only works over HTTPS (or localhost)
- Scoped to origin (can't access other sites)
- Can't access DOM directly (runs in background)

---

## 📊 Performance Considerations

### Service Worker Cache Size
- Precache: ~1-5 MB (app shell)
- Runtime cache: ~10-50 MB (API responses, images)
- Browser limits: ~50-100 MB total

### Realtime Connections
- 1 WebSocket per logged-in user
- Minimal battery impact (persistent connection)
- Auto-reconnects if dropped

### Push Notification Battery
- OS optimizes delivery (batching, coalescing)
- Wake device only when notification arrives
- Minimal impact (<1% battery per day)

---

## 🚀 Deployment Checklist

### Client (Vite Build)
- [ ] Generate production VAPID keys
- [ ] Add `VITE_VAPID_PUBLIC_KEY` to `.env`
- [ ] Run `npm run build`
- [ ] Deploy to HTTPS host (Vercel, Netlify, etc.)
- [ ] Test installability

### Server (Supabase)
- [ ] Run all migrations in SQL Editor
- [ ] Enable Realtime for tables (via SQL or Publications UI)
- [ ] Deploy Edge Function: `supabase functions deploy send-match-notifications`
- [ ] Set secrets: `supabase secrets set VAPID_PRIVATE_KEY=xxx ...`
- [ ] Set up cron job (pg_cron or Supabase Dashboard)

### Testing
- [ ] Install PWA on mobile device
- [ ] Test offline mode (airplane mode)
- [ ] Assign to match → Get real-time notification
- [ ] Wait for match reminder (5 min before)
- [ ] Click notification → Opens correct page

---

## 🛠️ Troubleshooting

### Service Worker not registering
**Check:** DevTools → Application → Service Workers
**Fix:** HTTPS required (or localhost)

### Notifications not appearing
**Check:** Browser console for errors
**Fix:** Ensure permission granted, SW active

### Realtime not working
**Check:** `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`
**Fix:** Run `ALTER PUBLICATION supabase_realtime ADD TABLE matches;`

### Duplicate notifications on refresh
**Check:** `notified` flag in database
**Fix:** Add RLS policy for UPDATE on `match_assignment_notifications`

---

## 📚 Key Technologies

| Technology | Purpose | Docs |
|------------|---------|------|
| **Service Workers** | Background scripts, caching | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) |
| **Workbox** | Service worker caching library | [workboxjs.org](https://developers.google.com/web/tools/workbox) |
| **VitePWA** | Vite plugin for PWA | [vite-pwa-org.netlify.app](https://vite-pwa-org.netlify.app) |
| **Web Push API** | Browser push notifications | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) |
| **VAPID** | Voluntary Application Server Identification | [RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292) |
| **Supabase Realtime** | PostgreSQL change events via WebSocket | [supabase.com/docs/guides/realtime](https://supabase.com/docs/guides/realtime) |

---

## 🎯 Summary

**Your app now has:**
- ✅ **Installable PWA** - Add to home screen, standalone mode
- ✅ **Offline-first** - Works without internet after first load
- ✅ **Smart caching** - Fast loads, background updates
- ✅ **Real-time notifications** - Instant alerts when assigned to matches
- ✅ **Server-side push** - Reminders even when app is closed
- ✅ **Non-intrusive updates** - Never interrupts scouting
- ✅ **Robust offline storage** - LocalStorage backup for match data

**This is a production-ready, competition-grade FRC scouting application!** 🤖🔧
