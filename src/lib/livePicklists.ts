import { supabase } from "@/lib/supabase";

/** A short label the host puts on a team in the live picklist. */
export interface LivePicklistTag {
  /** Up to TAG_MAX_LENGTH characters. */
  text: string;
  /** Background color, as a hex code. */
  color: string;
}

export const TAG_MAX_LENGTH = 25;

/** Whether two tags are the same tag: same text, ignoring case, and color. */
export function sameTag(a: LivePicklistTag, b: LivePicklistTag): boolean {
  return a.text.toLowerCase() === b.text.toLowerCase() && a.color === b.color;
}

/** Tags made from pit scouting: shooter type, then robot height. Colors are from the tag editor's swatches. */
const SHOOTER_TAGS: Array<{ answer: string; tag: LivePicklistTag }> = [
  { answer: "turret", tag: { text: "Turret", color: "#2563eb" } },
  { answer: "drum", tag: { text: "Drum", color: "#0d9488" } },
];
const HEIGHT_TAGS: Record<string, LivePicklistTag> = {
  Short: { text: "Short", color: "#16a34a" },
  Tall: { text: "Tall", color: "#ea580c" },
  Modular: { text: "Modular", color: "#9333ea" },
  "Stretchy net": { text: "Stretchy net", color: "#db2777" },
};

/**
 * A team's pit scouting tags, from its latest pit answers: Turret and/or Drum for its
 * shooting mechanism, and one of Short, Tall, Modular or Stretchy net for its height.
 */
export function pitTags(team: { shooterType: string; terrain: string }): LivePicklistTag[] {
  const shooter = team.shooterType.toLowerCase();
  const tags = SHOOTER_TAGS.filter(({ answer }) => shooter.includes(answer)).map(({ tag }) => tag);
  const height = HEIGHT_TAGS[team.terrain];
  return height ? [...tags, height] : tags;
}

/** Whether a tag is one of the pit scouting tags, text and color unchanged. */
const isPitTag = (tag: LivePicklistTag) =>
  [...SHOOTER_TAGS.map(({ tag: shooter }) => shooter), ...Object.values(HEIGHT_TAGS)].some((pit) => sameTag(pit, tag));

/**
 * Brings the host's tags up to date with pit scouting. `previous` is the pit tag text last
 * added to each team: those aren't added again (so one the host removed stays removed), and
 * ones the pit data no longer backs are taken off, unless the host has recolored them.
 * Returns the new tags and the pit tag text to remember for next time.
 */
export function syncPitTags(
  tags: Record<number, LivePicklistTag[]>,
  previous: Record<number, string[]>,
  made: Map<number, LivePicklistTag[]>
): { tags: Record<number, LivePicklistTag[]>; added: Record<number, string[]> } {
  const nextTags = { ...tags };
  const added: Record<number, string[]> = {};
  const teamNumbers = new Set([...Object.keys(previous).map(Number), ...made.keys()]);
  for (const teamNumber of teamNumbers) {
    const before = previous[teamNumber] ?? [];
    const now = (made.get(teamNumber) ?? []).map((tag) => ({ tag, text: tag.text.toLowerCase() }));
    const current = tags[teamNumber] ?? [];
    // Pit tags added before that the pit data has since dropped (e.g. a rescout changed the height)
    const stale = (tag: LivePicklistTag) => {
      const text = tag.text.toLowerCase();
      return before.includes(text) && !now.some((pit) => pit.text === text) && isPitTag(tag);
    };
    const kept = current.filter((tag) => !stale(tag));
    const fresh = now
      .filter(({ text }) => !before.includes(text) && !kept.some((tag) => tag.text.toLowerCase() === text))
      .map(({ tag }) => tag);
    const result = [...kept, ...fresh];
    if (result.length > 0) nextTags[teamNumber] = result;
    else delete nextTags[teamNumber];
    if (now.length > 0) added[teamNumber] = now.map(({ text }) => text);
  }
  return { tags: nextTags, added };
}

/** One team's spot in the live picklist. */
export interface LivePicklistEntry {
  teamNumber: number;
  /** Average place across the compiled picklists; null before the first compile. */
  averageRank: number | null;
  /** Placed by hand by the host since the last compile, so it no longer ties with anyone. */
  moved: boolean;
  /** Tied by hand by the host: teams next to each other with the same number share a place. */
  tieGroup?: number;
  /**
   * On someone's Do Not Pick list. Set by the host when sharing (viewers can't read everyone's
   * picklists); these teams are kept out of the main list and shown with the DNP Teams toggle.
   */
  dnp?: boolean;
  /** The host's tags on the team. Shared with everyone watching. */
  tags?: LivePicklistTag[];
  /** A single tag, as lists shared before teams could have several. Read through entryTags(). */
  tag?: LivePicklistTag;
  /**
   * The host's notes on the team for the live picklist (separate from their own picklist
   * notes). Shared with everyone watching.
   */
  note?: string;
}

/** Every distinct tag in use (same text, ignoring case, and color counts once), alphabetically. */
export function distinctTags(tagLists: Iterable<LivePicklistTag[]>): LivePicklistTag[] {
  const found: LivePicklistTag[] = [];
  for (const tags of tagLists) {
    for (const tag of tags) {
      if (!found.some((existing) => sameTag(existing, tag))) found.push(tag);
    }
  }
  return found.sort((a, b) => a.text.localeCompare(b.text));
}

/** A shared entry's tags, including the single tag of lists shared before teams could have several. */
export function entryTags(entry: LivePicklistEntry): LivePicklistTag[] {
  return entry.tags ?? (entry.tag ? [entry.tag] : []);
}

export interface LivePicklistRow {
  event_id: string;
  host_id: string;
  entries: LivePicklistEntry[];
  /** How many picklists the list is averaged from (0 = sorted by team number). */
  compiled_count: number;
  is_live: boolean;
  updated_at: string;
}

/** Up or down the team's list, into or out of DNP Teams, or tied with another team. */
export type SuggestionDirection = "up" | "down" | "to_dnp" | "from_dnp" | "tie";

export interface LivePicklistSuggestion {
  id: string;
  event_id: string;
  team_number: number;
  direction: SuggestionDirection;
  /** The team to tie with, for a "tie" suggestion; null otherwise. */
  tie_team_number: number | null;
  /** How many spots to move; null when the suggester didn't say, and for DNP moves and ties. */
  spots: number | null;
  /** Why the suggester wants the change; null when they didn't say. */
  reason: string | null;
  author_id: string;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
}

export async function getLivePicklist(eventId: string): Promise<LivePicklistRow | null> {
  const { data, error } = await supabase
    .from("live_picklists")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching live picklist:", error);
    return null;
  }

  return data;
}

/**
 * The host shares the list as it stands. `start` also marks the picklist as live (the host
 * opening it); later shares leave that alone, so a host's copy left open somewhere can't
 * switch an ended picklist back on.
 */
export async function publishLivePicklist(
  eventId: string,
  hostId: string,
  entries: LivePicklistEntry[],
  compiledCount: number,
  start = false
): Promise<boolean> {
  const { error } = await supabase.from("live_picklists").upsert(
    {
      event_id: eventId,
      host_id: hostId,
      entries,
      compiled_count: compiledCount,
      // Left out, a new row still starts live (the column defaults to true)
      ...(start ? { is_live: true } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );

  if (error) {
    console.error("Error publishing live picklist:", error);
    return false;
  }

  return true;
}

export async function endLivePicklist(eventId: string): Promise<boolean> {
  const { error } = await supabase
    .from("live_picklists")
    .update({ is_live: false, updated_at: new Date().toISOString() })
    .eq("event_id", eventId);

  if (error) {
    console.error("Error ending live picklist:", error);
    return false;
  }

  return true;
}

export async function getPendingSuggestions(eventId: string): Promise<LivePicklistSuggestion[]> {
  const { data, error } = await supabase
    .from("live_picklist_suggestions")
    .select("*")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching picklist suggestions:", error);
    return [];
  }

  return data ?? [];
}

/** How many suggestions can wait for the host at once (the database checks it too). */
export const SUGGESTION_LIMIT = 3;

/** How many suggestions are waiting for the host at an event. */
export async function countPendingSuggestions(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from("live_picklist_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "pending");

  if (error) {
    console.error("Error counting picklist suggestions:", error);
    return 0;
  }

  return count ?? 0;
}

/** The longest reason a suggestion can give (the database checks it too). */
export const SUGGESTION_REASON_MAX = 500;

export async function suggestMove(
  eventId: string,
  teamNumber: number,
  direction: SuggestionDirection,
  spots: number | null,
  tieTeamNumber: number | null = null,
  reason: string | null = null
): Promise<boolean> {
  const trimmedReason = reason?.trim().slice(0, SUGGESTION_REASON_MAX) || null;
  const { error } = await supabase
    .from("live_picklist_suggestions")
    .insert({
      event_id: eventId,
      team_number: teamNumber,
      direction,
      spots,
      ...(direction === "tie" ? { tie_team_number: tieTeamNumber } : {}),
      ...(trimmedReason ? { reason: trimmedReason } : {}),
    });

  if (error) {
    console.error("Error sending picklist suggestion:", error);
    return false;
  }

  return true;
}

export async function resolveSuggestion(
  id: string,
  status: "accepted" | "dismissed"
): Promise<boolean> {
  const { error } = await supabase.from("live_picklist_suggestions").update({ status }).eq("id", id);

  if (error) {
    console.error("Error resolving picklist suggestion:", error);
    return false;
  }

  return true;
}
