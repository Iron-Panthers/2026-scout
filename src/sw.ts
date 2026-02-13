/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkFirst,
} from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare let self: ServiceWorkerGlobalScope;

// Precache app shell (VitePWA injects the manifest here)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ----- Runtime Caching Strategies -----

// Supabase REST API calls (match data, profiles, etc.)
// StaleWhileRevalidate: serve from cache immediately, update in background
registerRoute(
  ({ url }) =>
    url.hostname.includes("supabase.co") &&
    url.pathname.startsWith("/rest/"),
  new StaleWhileRevalidate({
    cacheName: "supabase-api",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
  })
);

// Supabase Auth endpoints - NetworkFirst (auth must be fresh)
registerRoute(
  ({ url }) =>
    url.hostname.includes("supabase.co") &&
    url.pathname.startsWith("/auth/"),
  new NetworkFirst({
    cacheName: "supabase-auth",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// The Blue Alliance API - CacheFirst with expiration
// Match data is stable within an event but schedules can shift
registerRoute(
  ({ url }) => url.hostname === "www.thebluealliance.com",
  new CacheFirst({
    cacheName: "tba-api",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 30, // 30 minutes
      }),
    ],
  })
);

// External images (team photos from imgur, etc.)
registerRoute(
  ({ request, url }) =>
    request.destination === "image" && !url.hostname.includes("localhost"),
  new CacheFirst({
    cacheName: "external-images",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
      }),
    ],
  })
);

// ----- Push Notification Handling -----

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options: NotificationOptions = {
    body: data.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag || "match-notification",
    data: {
      url: data.url || "/dashboard",
      matchId: data.matchId,
    },
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "2026 Scout", options)
  );
});

// Handle notification click - navigate to the relevant match
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  // Detect base URL from service worker scope
  // In production: scope = /2026-scout/, in dev: scope = /
  const scope = self.registration.scope;
  const basePath = new URL(scope).pathname;

  // Build full URL with base path
  let targetPath = url;
  if (!url.startsWith(basePath) && !url.startsWith('http')) {
    targetPath = basePath.replace(/\/$/, '') + url;
  }

  const fullUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // If a window is already open, focus it and send navigation message
        for (const client of clients) {
          if ("focus" in client) {
            return client.focus().then(() => {
              // Send navigation message to the client with base path
              client.postMessage({
                type: "NAVIGATE",
                url: targetPath,
              });
            });
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(fullUrl);
      })
  );
});

// Listen for skip waiting message from the client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
