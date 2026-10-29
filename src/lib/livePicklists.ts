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

/** Up or down the team's list, or into or out of DNP Teams. */
export type SuggestionDirection = "up" | "down" | "to_dnp" | "from_dnp";

export interface LivePicklistSuggestion {
  id: string;
  event_id: string;
  team_number: number;
  direction: SuggestionDirection;
  /** How many spots to move; null when the suggester didn't say, and for DNP moves. */
  spots: number | null;
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

/** The host shares the list as it stands, which also marks the picklist as live. */
export async function publishLivePicklist(
  eventId: string,
  hostId: string,
  entries: LivePicklistEntry[],
  compiledCount: number
): Promise<boolean> {
  const { error } = await supabase.from("live_picklists").upsert(
    {
      event_id: eventId,
      host_id: hostId,
      entries,
      compiled_count: compiledCount,
      is_live: true,
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

export async function suggestMove(
  eventId: string,
  teamNumber: number,
  direction: SuggestionDirection,
  spots: number | null
): Promise<boolean> {
  const { error } = await supabase
    .from("live_picklist_suggestions")
    .insert({ event_id: eventId, team_number: teamNumber, direction, spots });

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
