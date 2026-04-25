// The Blue Alliance API client
// API Documentation: https://www.thebluealliance.com/apidocs/v3

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";
const TBA_AUTH_KEY = import.meta.env.VITE_TBA_AUTH_KEY;

// Current competition year
export const CURRENT_YEAR = 2026;

if (!TBA_AUTH_KEY) {
  console.warn("Missing TBA_AUTH_KEY environment variable");
}

interface TBATeamKey {
  team_number: number;
}

interface TBAMatch {
  key: string;
  comp_level: string;
  match_number: number;
  alliances: {
    red: {
      team_keys: string[]; // ["frc254", "frc971", "frc1678"]
      score: number;
    };
    blue: {
      team_keys: string[]; // ["frc1323", "frc5940", "frc2928"]
      score: number;
    };
  };
  score_breakdown?: {
    red: TBAScoreBreakdown;
    blue: TBAScoreBreakdown;
  };
}

interface TBAScoreBreakdown {
  autoTowerRobot1: string;
  autoTowerRobot2: string;
  autoTowerRobot3: string;
  endGameTowerRobot1: string;
  endGameTowerRobot2: string;
  endGameTowerRobot3: string;
  [key: string]: unknown;
}

export interface MatchTowerStatus {
  auto: [string, string, string];
  endgame: [string, string, string];
}

interface TBAMedia {
  type: string; // "imgur", "cdphotothread", "youtube", etc.
  foreign_key: string; // The ID/key for the media platform
  details?: {
    base64Image?: string;
  };
  preferred?: boolean;
  direct_url?: string;
  view_url?: string;
}

/**
 * Makes a request to The Blue Alliance API
 */
async function tbaFetch<T>(endpoint: string): Promise<T | null> {
  if (!TBA_AUTH_KEY) {
    console.error("TBA_AUTH_KEY is not configured");
    return null;
  }

  try {
    const response = await fetch(`${TBA_BASE_URL}${endpoint}`, {
      headers: {
        "X-TBA-Auth-Key": TBA_AUTH_KEY,
      },
    });

    if (!response.ok) {
      console.error(`TBA API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching from TBA:", error);
    return null;
  }
}

/**
 * Gets the team number that should be in a specific match role
 * @param eventCode - The event code (e.g., "2024cmp", "2024caln")
 * @param matchNumber - The match number
 * @param role - The role (red1, red2, red3, blue1, blue2, blue3) - NOT qual roles
 * @returns The team number (e.g., 1678) or null if not found
 */
export async function getMatchTeam(
  eventCode: string,
  matchNumber: number,
  role: string
): Promise<number | null> {
  // Map role to alliance and position
  const isRed = role.toLowerCase().startsWith("red");
  const alliance = isRed ? "red" : "blue";

  // Extract position number (red1 -> 0, red2 -> 1, red3 -> 2)
  const positionMatch = role.match(/\d+$/);
  if (!positionMatch) {
    console.error("Invalid role format:", role);
    return null;
  }
  const position = parseInt(positionMatch[0]) - 1; // Convert to 0-indexed

  // Fetch match data from TBA
  const matchKey = `${eventCode}_qm${matchNumber}`;
  const match = await tbaFetch<TBAMatch>(`/match/${matchKey}`);

  if (!match || !match.alliances) {
    console.error("Could not fetch match data for:", matchKey);
    return null;
  }

  // Get the team key from the appropriate alliance and position
  const teamKeys = match.alliances[alliance].team_keys;
  if (!teamKeys || position >= teamKeys.length) {
    console.error(`Position ${position} not found in ${alliance} alliance`);
    return null;
  }

  const teamKey = teamKeys[position]; // e.g., "frc1678"
  const teamNumber = parseInt(teamKey.replace("frc", ""));

  return teamNumber;
}

/**
 * Gets the preferred team photo for a given year
 * @param teamNumber - The team number (e.g., 1678)
 * @param year - The year (e.g., 2024, 2025)
 * @returns URL to the preferred team photo or null if not found
 */
export async function getTeamPhoto(
  teamNumber: number,
  year: number
): Promise<string | null> {
  const teamKey = `frc${teamNumber}`;
  const media = await tbaFetch<TBAMedia[]>(`/team/${teamKey}/media/${year}`);

  if (!media || media.length === 0) {
    console.log(`No media found for team ${teamNumber} in ${year}`);
    return null;
  }

  // Filter out unsupported media types like avatar
  const supportedTypes = ["imgur", "cdphotothread"];
  const supportedMedia = media.filter(
    (m) => supportedTypes.includes(m.type) || m.direct_url || m.view_url
  );

  if (supportedMedia.length === 0) {
    console.log(
      `No supported media types found for team ${teamNumber} in ${year}`
    );
    return null;
  }

  // Find the preferred media entry from supported types
  const preferredMedia = supportedMedia.find((m) => m.preferred === true);
  const targetMedia = preferredMedia || supportedMedia[0]; // Fall back to first supported if no preferred

  console.log(`Selected media for team ${teamNumber}:`, targetMedia);

  // Handle different media types
  if (targetMedia.type === "imgur") {
    // Imgur can be jpg, png, or other formats - try without extension first
    return `https://i.imgur.com/${targetMedia.foreign_key}.jpg`;
  } else if (targetMedia.type === "cdphotothread") {
    // Chief Delphi photo thread - use direct_url if available
    return targetMedia.direct_url || null;
  } else if (targetMedia.direct_url) {
    return targetMedia.direct_url;
  } else if (targetMedia.view_url) {
    return targetMedia.view_url;
  }

  console.log(`Unsupported media type: ${targetMedia.type}`);
  return null;
}

/**
 * Gets basic team information
 * @param teamNumber - The team number (e.g., 1678)
 * @returns Team data or null if not found
 */
export async function getTeamInfo(teamNumber: number) {
  const teamKey = `frc${teamNumber}`;
  return await tbaFetch(`/team/${teamKey}`);
}

const TBA_EV_CACHE_PFX = "tba_ev_";
const TBA_EV_CACHE_TTL = 5 * 60 * 1000; // 5 min

/**
 * Gets all matches for an event (with 5-min localStorage cache)
 * @param eventCode - The event code (e.g., "2024cmp", "2024caln")
 * @returns Array of matches or null if not found
 */
export async function getEventMatches(eventCode: string) {
  const cKey = TBA_EV_CACHE_PFX + eventCode;
  try {
    const raw = localStorage.getItem(cKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: TBAMatch[]; ts: number };
      if (Date.now() - ts < TBA_EV_CACHE_TTL) return data;
    }
  } catch { /* ignore */ }

  const data = await tbaFetch<TBAMatch[]>(`/event/${eventCode}/matches`);
  if (data) {
    try {
      localStorage.setItem(cKey, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
  }
  return data;
}

/**
 * Returns cached TBA event matches without making a network request.
 * Returns null if nothing is cached or cache is stale.
 */
export function getCachedEventMatches(eventCode: string): TBAMatch[] | null {
  try {
    const raw = localStorage.getItem(TBA_EV_CACHE_PFX + eventCode);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: TBAMatch[]; ts: number };
    if (Date.now() - ts < TBA_EV_CACHE_TTL) return data;
  } catch { /* ignore */ }
  return null;
}

export interface TBATeamSimple {
  team_number: number;
  nickname: string;
  city: string | null;
  state_prov: string | null;
}

/**
 * Gets all teams at an event (simple format)
 * @param eventCode - The event code (e.g., "2024cmp", "2024caln")
 * @returns Array of teams or empty array if not found
 */
export async function getEventTeams(eventCode: string): Promise<TBATeamSimple[]> {
  return (await tbaFetch<TBATeamSimple[]>(`/event/${eventCode}/teams/simple`)) ?? [];
}

/**
 * Gets autoTowerRobot1-3 and endgameRobotTower1-3 from TBA match score breakdown
 * @param eventCode - The event code (e.g., "2026caln")
 * @param matchNumber - The qual match number
 * @param alliance - "red" or "blue"
 * @returns Tower status for all three robots, or null if not available
 */
export async function getMatchTowerStatus(
  eventCode: string,
  matchNumber: number,
  alliance: "red" | "blue"
): Promise<MatchTowerStatus | null> {
  const matchKey = `${eventCode}_qm${matchNumber}`;
  const match = await tbaFetch<TBAMatch>(`/match/${matchKey}`);

  if (!match?.score_breakdown) {
    console.error("No score breakdown available for:", matchKey);
    return null;
  }

  const breakdown = match.score_breakdown[alliance];
  return {
    auto: [breakdown.autoTowerRobot1, breakdown.autoTowerRobot2, breakdown.autoTowerRobot3],
    endgame: [breakdown.endGameTowerRobot1, breakdown.endGameTowerRobot2, breakdown.endGameTowerRobot3],
  };
}