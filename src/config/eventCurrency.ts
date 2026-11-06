// Competition events with their own event currency: the name the Shop shows for the event,
// what its currency is called and the logo shown next to the balance and prices. Keyed by
// the event's `event_code`. Event items say which of these sells them (CosmeticDefinition
// `competitionEvent`); an event not listed here falls back to the defaults below.
export interface CompetitionEvent {
  name: string;
  currencyName: string;
  currencyLogo: string;
}

export const COMPETITION_EVENTS: Record<string, CompetitionEvent> = {
  "2026cc": {
    name: "Chezy Champs 2026",
    currencyName: "ChezCoins",
    currencyLogo: "/shop/chezy%20champs%20logo.png",
  },
  "2026mttd": {
    name: "Madtown Throwdown 2026",
    currencyName: "Madcoins",
    currencyLogo: "/shop/madtown%20logo.jpg",
  },
};

export const DEFAULT_EVENT_CURRENCY_LOGO = "/shop/chezy%20champs%20logo.png";
export const DEFAULT_EVENT_CURRENCY_NAME = "ChezCoins";

const competitionEvent = (eventCode?: string | null) => (eventCode ? COMPETITION_EVENTS[eventCode] : undefined);

/** Resolve the currency logo URL for an event, falling back to the default. */
export function getEventCurrencyLogo(eventCode?: string | null): string {
  return competitionEvent(eventCode)?.currencyLogo ?? DEFAULT_EVENT_CURRENCY_LOGO;
}

/** What the event's currency is called, e.g. "Madcoins". */
export function getEventCurrencyName(eventCode?: string | null): string {
  return competitionEvent(eventCode)?.currencyName ?? DEFAULT_EVENT_CURRENCY_NAME;
}

/** The event's name in the Shop, e.g. "Madtown Throwdown 2026"; its own name when not listed. */
export function getCompetitionEventName(event: { name: string; event_code: string | null } | null | undefined): string | undefined {
  return event ? competitionEvent(event.event_code)?.name ?? event.name : undefined;
}
