/**
 * Seasonal events: limited-time events (unlike competition events, they follow the calendar)
 * with their own shop tab. Everyone who opens the app while one is on is awarded its items
 * for free, once. Afterwards people keep what they got, but its items aren't handed out or
 * shown in the shop any more.
 *
 * A seasonal event's items are cosmetics (src/config/cosmetics.ts) with `seasonalEvent` set
 * to its id.
 */
export interface SeasonalEvent {
  id: string;
  name: string;
  /** Shorter name for the shop tab. */
  tabLabel: string;
  /** First and last day, inclusive, in each person's own time zone ("YYYY-MM-DD"). */
  startDate: string;
  endDate: string;
  /** The popup shown when someone is first awarded the event's items, before revealing them. */
  welcome?: { title: string; message: string };
  /**
   * The popup for its attendance rewards (items with `attendanceReward`), given to people who
   * open the app on every day of the event.
   */
  attendance?: { title: string; message: string };
}

export const SEASONAL_EVENTS: SeasonalEvent[] = [
  {
    id: "halloween_2026",
    name: "Halloween 2026",
    tabLabel: "Halloween",
    startDate: "2026-10-31",
    endDate: "2026-10-31",
    welcome: {
      title: "Happy Halloween!",
      message: "Thank you for signing on on this spooky holiday. Enjoy some free items!",
    },
  },
  {
    id: "thanksgiving_2026",
    name: "Thanksgiving 2026",
    tabLabel: "Thanksgiving",
    startDate: "2026-11-25",
    endDate: "2026-11-29",
    welcome: {
      title: "Happy Thanksgiving!",
      message: "Thanks for signing on this Thanksgiving! Here's a turkey. Sign on every day through Nov 29 to earn a special theme.",
    },
    attendance: {
      title: "Perfect attendance!",
      message: "You signed on all 5 days of Thanksgiving 2026. Thanks for being part of the team!",
    },
  },
];

/** Border and background color of seasonal event item cards, whatever their rarity (red-500). */
export const SEASONAL_ITEM_COLOR = "#ef4444";

/** The name of the seasonal event an item belongs to (its banner), or undefined. */
export const seasonalEventName = (id: string | undefined) =>
  id ? SEASONAL_EVENTS.find((event) => event.id === id)?.name : undefined;

/** Today in the device's time zone, as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const isSeasonalEventActive = (event: SeasonalEvent, now = new Date()) => {
  const today = localDateKey(now);
  return event.startDate <= today && today <= event.endDate;
};

/** How many days the event runs (start and end both count). */
export function seasonalEventDayCount(event: SeasonalEvent): number {
  const toDay = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  return toDay(event.endDate) - toDay(event.startDate) + 1;
}

export const activeSeasonalEvents = (now = new Date()) => SEASONAL_EVENTS.filter((event) => isSeasonalEventActive(event, now));

/** "Oct 30 – Nov 1" */
export function seasonalEventDates(event: SeasonalEvent): string {
  const format = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return `${format(event.startDate)} – ${format(event.endDate)}`;
}

/** Sent on `window` once today's seasonal event visit is recorded, so an open Shop can update its day count. */
export const SEASONAL_LOGIN_RECORDED_EVENT = "seasonal-login-recorded";

/** Sent on `window` when items are awarded, so an open Shop can refresh what's owned. */
export const COSMETICS_GRANTED_EVENT = "cosmetics-granted";
