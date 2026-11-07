import type { Event } from "@/types";

/** Letters a team's extra robots go by at off-season events. */
export const BBOT_LETTERS = ["B", "C", "D", "E"] as const;

/** An off-season demo team that's really one of a main team's extra robots. */
export interface BBot {
  /** The main team's number, e.g. 581. */
  team: number;
  /** Which of its robots: B, C, D or E. */
  bot: string;
}

/** "581B" (as stored in events.bbot_teams) as a team and letter; null when it isn't one. */
function parseBBot(value: unknown): BBot | null {
  const match = typeof value === "string" ? value.trim().toUpperCase().match(/^(\d{1,5})\s*([B-E])$/) : null;
  return match ? { team: Number(match[1]), bot: match[2] } : null;
}

/** The event's demo team numbers and the robots they stand for; empty unless the event converts them. */
export function eventBBots(event: Pick<Event, "convert_bbots" | "bbot_teams"> | null | undefined): Map<number, BBot> {
  const bbots = new Map<number, BBot>();
  if (!event?.convert_bbots) return bbots;
  for (const [demoNumber, value] of Object.entries(event.bbot_teams ?? {})) {
    const bbot = parseBBot(value);
    if (bbot && /^\d+$/.test(demoNumber)) bbots.set(Number(demoNumber), bbot);
  }
  return bbots;
}

/** The demo number an event lists for a team's lettered robot (581, "B" → 9991); null when it lists none. */
export function bbotDemoNumber(bbotTeams: Record<string, string> | null | undefined, team: number, bot: string): number | null {
  for (const [demoNumber, value] of Object.entries(bbotTeams ?? {})) {
    const bbot = parseBBot(value);
    if (bbot && bbot.team === team && bbot.bot === bot.toUpperCase() && /^\d+$/.test(demoNumber)) return Number(demoNumber);
  }
  return null;
}

/** One line per conversion ("9991 → 581 B"), sorted by main team, for the editor. */
export function formatBBotLines(teams: Record<string, string> | null | undefined): string {
  return Object.entries(teams ?? {})
    .map(([demoNumber, value]) => ({ demoNumber, bbot: parseBBot(value) }))
    .filter((item): item is { demoNumber: string; bbot: BBot } => !!item.bbot)
    .sort((a, b) => a.bbot.team - b.bbot.team || a.bbot.bot.localeCompare(b.bbot.bot))
    .map(({ demoNumber, bbot }) => `${demoNumber} → ${bbot.team} ${bbot.bot}`)
    .join("\n");
}

/**
 * Reads the editor's lines: a demo number, then the main team and letter, with anything
 * between them ("9991 581B", "9991 → 581 B", "9991: 581 b"). Blank lines are skipped;
 * anything else unreadable, or a demo number listed twice, is an error naming the line.
 */
export function parseBBotLines(text: string): { teams: Record<string, string>; errors: string[] } {
  const teams: Record<string, string> = {};
  const errors: string[] = [];
  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const match = trimmed.match(/^(\d{1,5})\D+?(\d{1,5})\s*([B-Eb-e])$/);
    if (!match) {
      errors.push(`Line ${index + 1} ("${trimmed}") should look like "9991 → 581 B".`);
      return;
    }
    const [, demoNumber, team, bot] = match;
    if (demoNumber in teams) {
      errors.push(`Line ${index + 1}: ${demoNumber} is already listed.`);
      return;
    }
    teams[demoNumber] = `${Number(team)}${bot.toUpperCase()}`;
  });
  return { teams, errors };
}

/** "Blazing Bulldogs (B)": a demo number's name, from its main team's name and its letter. */
export function bbotName(bbot: BBot, mainTeamName: string | null | undefined): string {
  return `${mainTeamName?.trim() || `Team ${bbot.team}`} (${bbot.bot})`;
}

/** A number → name map with each converted demo number named after its main team (numbers stay the same). */
export function withBBotNameMap(names: Map<number, string>, bbots: Map<number, BBot>): Map<number, string> {
  if (bbots.size === 0) return names;
  const renamed = new Map(names);
  for (const [demoNumber, bbot] of bbots) {
    if (names.has(demoNumber)) renamed.set(demoNumber, bbotName(bbot, names.get(bbot.team)));
  }
  return renamed;
}

/** An event's team list with each converted demo number named after its main team (numbers stay the same). */
export function withBBotNames<T extends { team_number: number; nickname: string }>(teams: T[], bbots: Map<number, BBot>): T[] {
  if (bbots.size === 0) return teams;
  const names = new Map(teams.map((team) => [team.team_number, team.nickname]));
  return teams.map((team) => {
    const bbot = bbots.get(team.team_number);
    return bbot ? { ...team, nickname: bbotName(bbot, names.get(bbot.team)) } : team;
  });
}
