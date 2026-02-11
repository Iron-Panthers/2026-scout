let registration: ServiceWorkerRegistration | null = null;
let updateCallback: (() => void) | null = null;

/**
 * Register the service worker and set up update detection.
 */
export async function registerSW(
  onUpdate?: () => void
): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service workers not supported");
    return null;
  }

  updateCallback = onUpdate || null;

  try {
    registration = await navigator.serviceWorker.register("/sw.js", {
      type: "module",
      scope: "/",
    });

    // Check for updates every 60 minutes
    setInterval(() => {
      registration?.update();
    }, 60 * 60 * 1000);

    // Listen for new service worker waiting
    registration.addEventListener("updatefound", () => {
      const newWorker = registration?.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // New version available
          updateCallback?.();
        }
      });
    });

    return registration;
  } catch (error) {
    console.error("SW registration failed:", error);
    return null;
  }
}

/**
 * Skip waiting and activate the new service worker.
 */
export function applyUpdate() {
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }
}

/**
 * Get the current SW registration (needed for push subscription).
 */
export function getRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

/**
 * Wait for the service worker to finish registering.
 * Polls until registration is complete or timeout is reached.
 *
 * @param timeoutMs Maximum time to wait in milliseconds (default 10000)
 * @returns The SW registration or null if timeout
 */
export async function waitForRegistration(
  timeoutMs = 10000
): Promise<ServiceWorkerRegistration | null> {
  const startTime = Date.now();

  // If already registered, return immediately
  if (registration) return registration;

  // Poll until registration completes or timeout
  while (Date.now() - startTime < timeoutMs) {
    if (registration) return registration;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.warn("Service worker registration timeout");
  return null;
}
