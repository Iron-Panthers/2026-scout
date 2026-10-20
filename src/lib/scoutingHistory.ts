import { supabase } from "@/lib/supabase";
import { getEventLocation, getEventName } from "@/lib/blueAlliance";
import { refreshEventLeaderboard } from "@/lib/leaderboards";
import { getEvents } from "@/lib/matches";

/** One event a scouter scouted at, for the profile page's map. */
export interface ScoutedEvent {
  /** The event's id (kept on the saved leaderboard row even after the event is deleted). */
  key: string;
  name: string;
  eventCode: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Distinct matches scouted (match + qual); null on rows saved before this was tracked. */
  matchesScouted: number | null;
  /** All submissions (match, qual and pit). */
  submissions: number;
  /** Added by the scouter from their profile ("Incorrect?"), not recorded by the app. */
  addedByScouter?: boolean;
  /** The scouter says they were a scouting manager at this event. */
  scoutingManager?: boolean;
}

/** An event a scouter added themselves (scouter_added_events). */
export interface AddedEvent {
  event_code: string;
  event_name: string;
  start_date: string;
  end_date: string | null;
  /** Matches they say they scouted there; null if they didn't say. */
  matches_scouted: number | null;
}

interface LeaderboardRow {
  event_id: string;
  event_code: string | null;
  event_name: string;
  event_location: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  matches_scouted: number | null;
  submission_count: number;
}

/**
 * Every event this scouter has scouted at, from the saved leaderboards
 * (event_leaderboards). Those rows outlive the event, so deleted events stay on the map.
 * Events that still exist are re-counted first, so recent scouting shows up.
 */
export async function getScoutedEvents(scouterId: string): Promise<ScoutedEvent[]> {
  const liveEvents = await getEvents();
  await Promise.all(liveEvents.map((event) => refreshEventLeaderboard(event.id)));

  const { data, error } = await supabase
    .from("event_leaderboards")
    .select("event_id, event_code, event_name, event_location, event_start_date, event_end_date, matches_scouted, submission_count")
    .eq("scouter_id", scouterId);
  if (error) {
    console.error("Error loading scouting history:", error);
    return [];
  }

  const recorded: ScoutedEvent[] = ((data ?? []) as LeaderboardRow[]).map((row) => ({
    key: row.event_id,
    name: row.event_name,
    eventCode: row.event_code,
    location: row.event_location,
    startDate: row.event_start_date,
    endDate: row.event_end_date,
    matchesScouted: row.matches_scouted,
    submissions: row.submission_count,
  }));

  // Plus events the scouter added themselves, unless the app already has them
  const recordedCodes = new Set(recorded.map((event) => event.eventCode).filter(Boolean));
  const added: ScoutedEvent[] = (await getAddedEvents(scouterId))
    .filter((event) => !recordedCodes.has(event.event_code))
    .map((event) => ({
      key: `added:${event.event_code}`,
      name: event.event_name,
      eventCode: event.event_code,
      location: null,
      startDate: event.start_date,
      endDate: event.end_date,
      matchesScouted: event.matches_scouted,
      submissions: 0,
      addedByScouter: true,
    }));

  const managerCodes = await getScoutingManagerEventCodes(scouterId);
  return [...recorded, ...added]
    .map((event) => ({ ...event, scoutingManager: !!event.eventCode && managerCodes.has(event.eventCode) }))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}

/** Event codes the user marked themselves as a scouting manager at. */
export async function getScoutingManagerEventCodes(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("scouting_manager_events").select("event_code").eq("user_id", userId);
  if (error) {
    console.error("Error loading scouting manager events:", error);
    return new Set();
  }
  return new Set((data ?? []).map((row: { event_code: string }) => row.event_code));
}

/** Marks (or unmarks) the signed-in user as a scouting manager at an event; only their team years are accepted. */
export async function setScoutingManager(userId: string, eventCode: string, manager: boolean): Promise<boolean> {
  const { error } = manager
    ? await supabase
        .from("scouting_manager_events")
        .upsert({ user_id: userId, event_code: eventCode }, { onConflict: "user_id,event_code", ignoreDuplicates: true })
    : await supabase.from("scouting_manager_events").delete().eq("user_id", userId).eq("event_code", eventCode);
  if (error) {
    console.error("Error updating scouting manager event:", error);
    return false;
  }
  return true;
}

export async function getAddedEvents(userId: string): Promise<AddedEvent[]> {
  const { data, error } = await supabase
    .from("scouter_added_events")
    .select("event_code, event_name, start_date, end_date, matches_scouted")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("Error loading added events:", error);
    return [];
  }
  return (data ?? []) as AddedEvent[];
}

/** Adds events to the signed-in user's map; the database only accepts their team years. */
export async function addEvents(userId: string, events: AddedEvent[]): Promise<boolean> {
  if (events.length === 0) return true;
  const { error } = await supabase
    .from("scouter_added_events")
    .upsert(events.map((event) => ({ user_id: userId, ...event })), { onConflict: "user_id,event_code" });
  if (error) {
    console.error("Error adding events:", error);
    return false;
  }
  return true;
}

/** Changes how many matches the signed-in user says they scouted at an event they added. */
export async function setAddedEventMatches(userId: string, eventCode: string, matches: number | null): Promise<boolean> {
  const { error } = await supabase
    .from("scouter_added_events")
    .update({ matches_scouted: matches })
    .eq("user_id", userId)
    .eq("event_code", eventCode);
  if (error) {
    console.error("Error updating matches scouted:", error);
    return false;
  }
  return true;
}

export async function removeAddedEvent(userId: string, eventCode: string): Promise<boolean> {
  const { error } = await supabase.from("scouter_added_events").delete().eq("user_id", userId).eq("event_code", eventCode);
  if (error) {
    console.error("Error removing added event:", error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

/** "2024 Silicon Valley Regional" → "Silicon Valley Regional" (a leading or trailing season year). */
export function withoutYear(name: string): string {
  return name.replace(/^\s*(19|20)\d{2}\s+/, "").replace(/\s+(19|20)\d{2}\s*$/, "").trim() || name;
}

const NAMES_CACHE_KEY = "event-names-v1";

/**
 * The event's name as TBA has it (looked up by event code, cached in the browser), without
 * the year. Falls back to the name saved in the app.
 */
export async function getEventDisplayName(event: ScoutedEvent): Promise<string> {
  const fallback = withoutYear(event.name);
  if (!event.eventCode) return fallback;
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(localStorage.getItem(NAMES_CACHE_KEY) || "{}");
  } catch {
    /* unreadable cache: look it up again */
  }
  if (cache[event.eventCode]) return withoutYear(cache[event.eventCode]);
  const name = await getEventName(event.eventCode);
  if (!name) return fallback;
  cache[event.eventCode] = name;
  try {
    localStorage.setItem(NAMES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked */
  }
  return withoutYear(name);
}

// ---------------------------------------------------------------------------
// Event coordinates
// ---------------------------------------------------------------------------

export interface EventCoordinates {
  lat: number;
  lng: number;
  /** Two-letter US state code, when known. */
  state: string | null;
}

const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Normalises "CA" or "California" to "CA"; null if it isn't a US state. */
function stateCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (US_STATES[upper]) return upper;
  const match = Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === trimmed.toLowerCase());
  return match ? match[0] : null;
}

const COORDS_CACHE_KEY = "event-coordinates-v1";

function readCoordsCache(): Record<string, EventCoordinates | null> {
  try {
    return JSON.parse(localStorage.getItem(COORDS_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCoordsCache(cache: Record<string, EventCoordinates | null>) {
  try {
    localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked: just geocode again next time */
  }
}

/** City → coordinates via Open-Meteo's free geocoder (no API key), preferring a match in `state`. */
async function geocodeCity(city: string, state: string | null): Promise<EventCoordinates | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json&countryCode=US`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const { results } = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; admin1?: string }>;
    };
    if (!results?.length) return null;
    const stateName = state ? US_STATES[state] : null;
    const best = (stateName && results.find((r) => r.admin1 === stateName)) || results[0];
    return { lat: best.latitude, lng: best.longitude, state: stateCode(best.admin1) ?? state };
  } catch {
    return null;
  }
}

/**
 * Where an event was held. Uses TBA's coordinates when it has them, otherwise geocodes
 * the city from TBA (or from the event's own "City, ST" location text). Results are
 * cached in the browser, so each event is only looked up once.
 */
export async function getEventCoordinates(event: ScoutedEvent): Promise<EventCoordinates | null> {
  const cacheKey = event.eventCode || event.key;
  const cache = readCoordsCache();
  if (cacheKey in cache) return cache[cacheKey];

  let coords: EventCoordinates | null = null;
  const tba = event.eventCode ? await getEventLocation(event.eventCode) : null;
  const tbaState = stateCode(tba?.state_prov);
  const isUS = !tba?.country || /^(usa|us|united states)$/i.test(tba.country);
  if (tba?.lat != null && tba.lng != null) {
    coords = { lat: tba.lat, lng: tba.lng, state: tbaState };
  } else if (tba?.city && isUS) {
    coords = await geocodeCity(tba.city, tbaState);
  } else if (!tba && event.location) {
    // e.g. "San Jose, CA" or "San Jose, California, USA"
    const [city, state] = event.location.split(",").map((part) => part.trim());
    if (city) coords = await geocodeCity(city, stateCode(state));
  }

  // Only cache real answers; a failed lookup (e.g. offline) is retried next time
  if (coords || tba) {
    cache[cacheKey] = coords;
    writeCoordsCache(cache);
  }
  return coords;
}
