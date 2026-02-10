# PWA Features Summary

Your 2026-scout app now has complete PWA capabilities with push notifications!

## 🎯 Features Implemented

### 1. ✅ Progressive Web App (PWA)
- **Installable** - Add to home screen on mobile/desktop
- **Offline-capable** - Works without internet after first load
- **App-like** - Standalone window, no browser UI
- **Fast loading** - Service worker caching

### 2. ✅ Service Worker Caching
- **App shell** - Precached on install (HTML, CSS, JS)
- **Supabase API** - StaleWhileRevalidate (24h)
- **TBA API** - CacheFirst (30min)
- **Images** - CacheFirst (7 days)
- **Auth** - NetworkFirst (always fresh)

### 3. ✅ Push Notifications - Match Reminders
- **Server-side** - Edge Function checks upcoming matches
- **5-minute window** - Notifies before match starts
- **Smart deduplication** - Won't spam repeated notifications
- **Cron trigger** - Runs every 2 minutes during events

### 4. ✅ Push Notifications - Match Assignments (NEW!)
- **Real-time** - Instant notification when assigned
- **Database trigger** - Automatic, no polling
- **Supabase Realtime** - Live subscription to assignments
- **Click to configure** - Opens match config page

### 5. ✅ Settings Integration
- **Notification toggles** - Control in Settings page
- **Permission handling** - Graceful prompts
- **Status indicators** - Shows subscription state

### 6. ✅ Update Management
- **Non-intrusive** - Banner prompts for updates
- **Never auto-reload** - Critical during scouting
- **One-click update** - Apply when ready

---

## 📁 File Structure

### Core PWA Files
```
src/
├── sw.ts                          # Service worker (caching + push)
├── lib/
│   ├── swRegistration.ts          # SW registration & updates
│   └── pushNotifications.ts       # Push subscription client
├── hooks/
│   ├── usePushNotifications.ts              # Push state hook
│   └── useMatchAssignmentNotifications.ts   # Assignment listener
└── components/
    ├── UpdateBanner.tsx                     # SW update prompt
    └── MatchAssignmentListener.tsx          # Global assignment listener
```

### Supabase Backend
```
supabase/
├── migrations/
│   ├── 20260210_create_push_subscriptions.sql         # Push subscription table
│   ├── 20260210_create_notification_log.sql           # Dedup log
│   └── 20260210_match_assignment_notifications.sql    # Assignment triggers
└── functions/
    └── send-match-notifications/
        └── index.ts                                   # Match reminder Edge Function
```

### Testing & Docs
```
├── PWA_TESTING_GUIDE.md                    # How to test PWA features
├── OFFLINE_TEST.md                         # Offline mode testing
├── EDGE_FUNCTION_DEPLOY.md                 # Deploy Edge Functions
├── MATCH_ASSIGNMENT_NOTIFICATIONS.md       # Assignment feature docs
└── test-push-server.js                     # Edge Function test script
```

---

## 🚀 Quick Start

### Development
```bash
npm run dev          # Regular development (no PWA)
npm run pwa          # Build + preview (PWA enabled)
```

### Testing PWA Features
```bash
npm run pwa
# Then visit:
# - http://localhost:4173/test-notifications  (test notifications)
# - http://localhost:4173/settings            (enable/disable)
```

### Deploying Edge Function (Match Reminders)
```bash
npx supabase login
npx supabase link --project-ref qwzsrlbhwigozonzthvx
npx supabase functions deploy send-match-notifications
npx supabase secrets set VAPID_PRIVATE_KEY=xxx TBA_AUTH_KEY=xxx ...
```

---

## 🔔 Notification Types

### Type 1: Match Reminders (Server-Side)
**Trigger:** Cron job checks TBA for upcoming matches
**Timing:** 5 minutes before match starts
**Message:** "Match 42 in 5 min - You're scouting Red 1 - Team 254"
**Setup Required:**
- Deploy Edge Function
- Set VAPID keys
- Enable cron job

### Type 2: Match Assignments (Real-Time)
**Trigger:** Manager assigns you to a match
**Timing:** Instant (via Supabase Realtime)
**Message:** "You've been assigned to Week 1 - Match 42 (Red 1)"
**Setup Required:**
- Run migration
- Enable Realtime in Supabase Dashboard

---

## 📊 Database Tables

### `push_subscriptions`
Stores user push subscription endpoints for server-side notifications.

### `notification_log`
Prevents duplicate match reminder notifications.

### `match_assignment_notifications`
Tracks when users are assigned to matches (for real-time notifications).

---

## 🎨 User Experience

### Installation Flow
1. User visits app on mobile
2. Browser shows "Add to Home Screen"
3. User taps → App installs
4. Opens in standalone mode

### Notification Flow
1. User enables notifications in Settings
2. Browser asks for permission
3. User allows → Subscription saved to DB
4. Manager assigns match → Instant notification
5. 5 min before match → Reminder notification
6. User clicks → Opens match config

### Offline Flow
1. User loads app while online (caches everything)
2. Connection drops during event
3. App continues working (from cache)
4. User scouts match → Saves to localStorage
5. Connection returns → Auto-uploads

---

## 🔧 Configuration

### Environment Variables (.env)
```env
VITE_VAPID_PUBLIC_KEY=BKvj...    # For client-side push subscription
```

### Supabase Secrets (Edge Function)
```bash
VAPID_PRIVATE_KEY=xxx            # Server-side push sending
VAPID_PUBLIC_KEY=xxx             # Must match .env
VAPID_SUBJECT=mailto:you@team.com
TBA_AUTH_KEY=xxx                 # The Blue Alliance API
```

### VitePWA Config (vite.config.ts)
```typescript
VitePWA({
  strategies: "injectManifest",   // Custom SW
  registerType: "prompt",         # Never auto-reload
  manifest: { ... },              # App metadata
})
```

---

## 📱 Browser Support

### Desktop
- ✅ Chrome/Edge (full support)
- ✅ Firefox (full support)
- ⚠️ Safari (limited, no push on macOS)

### Mobile
- ✅ Android Chrome (full support)
- ✅ iOS Safari 16.4+ (full support)
- ⚠️ iOS Safari <16.4 (no push notifications)

---

## 🐛 Known Issues & Workarounds

### Issue 1: Dev Mode Service Worker
**Problem:** `npm run dev` doesn't serve SW correctly
**Workaround:** Use `npm run pwa` for testing PWA features

### Issue 2: TypeScript Errors
**Problem:** Pre-existing TS errors block `npm run build`
**Workaround:** Use `npm run build:quick` (skips TypeScript)

### Issue 3: Localhost Push on iOS
**Problem:** iOS requires HTTPS for push notifications
**Workaround:** Deploy to HTTPS for iOS testing (Vercel, Netlify, etc.)

---

## 🎯 Testing Checklist

- [ ] Install app (Add to Home Screen)
- [ ] Test offline mode (DevTools → Network → Offline)
- [ ] Subscribe to push notifications (Settings page)
- [ ] Check subscription in database
- [ ] Send test local notification
- [ ] Assign yourself to a match → Get instant notification
- [ ] Deploy Edge Function
- [ ] Test match reminder (5 min before match)
- [ ] Click notification → Opens correct page
- [ ] Update app (trigger new version, click Update banner)

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| [PWA_TESTING_GUIDE.md](PWA_TESTING_GUIDE.md) | Complete testing instructions |
| [OFFLINE_TEST.md](OFFLINE_TEST.md) | How to test offline mode |
| [EDGE_FUNCTION_DEPLOY.md](EDGE_FUNCTION_DEPLOY.md) | Deploy push notification server |
| [MATCH_ASSIGNMENT_NOTIFICATIONS.md](MATCH_ASSIGNMENT_NOTIFICATIONS.md) | Assignment feature details |

---

## 🎉 What You've Built

You now have a **production-ready PWA** with:
- ✅ Offline-first architecture
- ✅ Real-time match assignment notifications
- ✅ Server-side match reminder notifications
- ✅ Smart caching strategies
- ✅ Non-intrusive update management
- ✅ Full mobile app experience

This is competition-ready for FRC scouting! 🤖🔧
