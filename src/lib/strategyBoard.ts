import { getEvents } from "@/lib/matches";
import { getDevEvent, getDevEvents } from "@/lib/devMode";
import { getDevEventSchedule, getEventSchedule, includesTeam, type MatchTeam } from "@/lib/strategyData";
import type { Event } from "@/types";

/** Our team: the strategy board lists its matches. */
export const OUR_TEAM = 5026;

/** The field image's size in pixels; everything on the board is positioned in these units. */
export const FIELD_WIDTH = 1256;
export const FIELD_HEIGHT = 624;
/** A robot with bumpers (about 34 in square): the field's ~651 in run across ~1133 px of the image. */
export const ROBOT_SIZE = 60;

export const BOARD_PAGES = [
  { key: "auto", label: "Auto" },
  { key: "transition", label: "Transition" },
  { key: "off", label: "Off" },
  { key: "on", label: "On" },
  { key: "endgame", label: "Endgame" },
] as const;
export type BoardPageKey = (typeof BOARD_PAGES)[number]["key"];

export type Alliance = "red" | "blue";

export interface BoardRobot {
  team: MatchTeam;
  alliance: Alliance;
  /** Its center. */
  x: number;
  y: number;
  /** Degrees clockwise; 0 has its front facing the top of the field. */
  angle: number;
}

/** How a pen line is drawn; lines saved before there were styles are solid. */
export type PenStyle = "solid" | "dashed" | "dotted" | "highlighter";

export interface BoardStroke {
  id: string;
  color: string;
  width: number;
  /** Left out for solid lines. */
  style?: PenStyle;
  /** x, y, x, y, … */
  points: number[];
}

export interface BoardPage {
  robots: BoardRobot[];
  strokes: BoardStroke[];
}

/** A match as the board shows it. */
export interface BoardMatch {
  /** e.g. "Qualification 12" or "Playoff Match 7". */
  name: string;
  red: MatchTeam[];
  blue: MatchTeam[];
}

/** A user's board for one match, saved in this browser only. */
export interface SavedBoard {
  version: 1;
  /** Kept with the drawings so the board opens without a connection. */
  match: BoardMatch | null;
  pages: Record<BoardPageKey, BoardPage>;
}

const STORAGE_PREFIX = "strategy-board:";
/** Where a user's board for a match is saved; `userId` is null for guests. */
const storageKey = (userId: string | null, matchKey: string) => `${STORAGE_PREFIX}${userId ?? "guest"}:${matchKey}`;

const emptyBoard = (): SavedBoard => ({
  version: 1,
  match: null,
  pages: Object.fromEntries(BOARD_PAGES.map((page): [BoardPageKey, BoardPage] => [page.key, { robots: [], strokes: [] }])) as Record<BoardPageKey, BoardPage>,
});

export function loadBoard(userId: string | null, matchKey: string): SavedBoard {
  try {
    // Boards saved before they were per user give everyone a copy to start from
    const raw = localStorage.getItem(storageKey(userId, matchKey)) ?? localStorage.getItem(STORAGE_PREFIX + matchKey);
    if (!raw) return emptyBoard();
    const saved = JSON.parse(raw) as SavedBoard;
    const empty = emptyBoard();
    const pages = { ...empty.pages, ...saved.pages };
    // Boards saved before B-bots (e.g. "254B") had plain team numbers
    for (const key of Object.keys(pages) as BoardPageKey[]) {
      pages[key] = { ...pages[key], robots: pages[key].robots.map((robot) => ({ ...robot, team: String(robot.team) })) };
    }
    const match = saved.match && { ...saved.match, red: saved.match.red.map(String), blue: saved.match.blue.map(String) };
    return { ...empty, ...saved, match, pages };
  } catch {
    return emptyBoard();
  }
}

/** False when the browser's storage is full. */
export function saveBoard(userId: string | null, matchKey: string, board: SavedBoard): boolean {
  try {
    localStorage.setItem(storageKey(userId, matchKey), JSON.stringify(board));
    return true;
  } catch {
    return false;
  }
}

/** Whether the user has drawn or placed anything on any of a match's pages. */
export function hasDrawing(userId: string | null, matchKey: string): boolean {
  return Object.values(loadBoard(userId, matchKey).pages).some((page) => page.robots.length > 0 || page.strokes.length > 0);
}

/** One of our matches in the list, keyed like TBA's match keys (e.g. "2026mttd_qm12"). */
export interface OurMatch extends BoardMatch {
  key: string;
  /** e.g. "Q12" or "M7". */
  short: string;
}

/** "M7" → "Playoff Match 7", "F2" → "Final 2"; older bracket labels stay as they are. */
function playoffName(label: string): string {
  if (/^M\d+$/.test(label)) return `Playoff Match ${label.slice(1)}`;
  if (/^F\d+$/.test(label)) return `Final ${label.slice(1)}`;
  return label;
}

/** The events to choose from (the sandbox's in dev mode), newest first, and which to start on: the active one. */
export async function getBoardEvents(sandboxUserId: string | null): Promise<{ events: Event[]; initialId: string | null }> {
  if (sandboxUserId) return { events: getDevEvents(sandboxUserId), initialId: getDevEvent(sandboxUserId).id };
  const events = await getEvents();
  return { events, initialId: (events.find((event) => event.is_active) ?? events[0])?.id ?? null };
}

/** The event a board's match key belongs to (keys start with the event's code, e.g. "2026mttd_qm12"). */
export const eventForMatchKey = (events: Event[], matchKey: string) =>
  events.find((event) => (event.event_code || event.id) === matchKey.split("_")[0]);

/** Our matches at an event, qualifications then playoffs. */
export async function getOurMatches(event: Event, sandboxUserId: string | null): Promise<OurMatch[]> {
  const code = event.event_code || event.id;
  const schedule = sandboxUserId
    ? getDevEventSchedule(sandboxUserId, event.id)
    : event.event_code
      ? await getEventSchedule(event.event_code, event.bbot_teams)
      : null;
  const ours = (match: Pick<BoardMatch, "red" | "blue">) => includesTeam(match.red, OUR_TEAM) || includesTeam(match.blue, OUR_TEAM);
  const matches: OurMatch[] = [
    ...(schedule?.matches ?? []).filter(ours).map((match) => ({
      key: `${code}_qm${match.matchNumber}`,
      short: `Q${match.matchNumber}`,
      name: `Qualification ${match.matchNumber}`,
      red: match.red,
      blue: match.blue,
    })),
    ...(schedule?.playoffs ?? []).filter(ours).map((match) => ({
      key: match.key,
      short: match.label,
      name: playoffName(match.label),
      red: match.red,
      blue: match.blue,
    })),
  ];
  return matches;
}
