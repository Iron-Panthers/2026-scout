import { supabase } from "@/lib/supabase";
import { getEventLocation } from "@/lib/blueAlliance";
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

  return ((data ?? []) as LeaderboardRow[])
    .map((row) => ({
      key: row.event_id,
      name: row.event_name,
      eventCode: row.event_code,
      location: row.event_location,
      startDate: row.event_start_date,
      endDate: row.event_end_date,
      matchesScouted: row.matches_scouted,
      submissions: row.submission_count,
    }))
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
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
