// Logo shown next to the event-currency ("ChezCoins") balance/icons.
// Keyed by the event's `event_code`, so each event can carry its own logo
// instead of every event sharing one hardcoded image. Add an entry below
// for a specific event; anything not listed falls back to the default.
export const EVENT_CURRENCY_LOGOS: Record<string, string> = {};

export const DEFAULT_EVENT_CURRENCY_LOGO = "/shop/chezy%20champs%20logo.png";

/** Resolve the currency logo URL for an event, falling back to the default. */
export function getEventCurrencyLogo(eventCode?: string | null): string {
  if (eventCode && EVENT_CURRENCY_LOGOS[eventCode]) {
    return EVENT_CURRENCY_LOGOS[eventCode];
  }
  return DEFAULT_EVENT_CURRENCY_LOGO;
}
