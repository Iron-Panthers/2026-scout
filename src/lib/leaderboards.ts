import { supabase } from "@/lib/supabase";

export interface LeaderboardRow {
  event_id: string;
  scouter_id: string;
  event_code: string | null;
  event_name: string;
  event_start_date: string | null;
  scouter_name: string;
  submission_count: number;
  points: number;
  snapshot_at: string;
}

export interface LeaderboardEvent {
  eventId: string;
  eventCode: string | null;
  eventName: string;
  startDate: string | null;
  rows: LeaderboardRow[];
}

/** Re-count an event's standings. A no-op once the event has been deleted (its final snapshot is kept). */
export async function refreshEventLeaderboard(eventId: string): Promise<void> {
  const { error } = await supabase.rpc("snapshot_event_leaderboard", { p_event_id: eventId });
  if (error) console.error("Error refreshing event leaderboard:", error);
}

/** Every saved leaderboard, newest event first, including events that no longer exist. */
export async function getLeaderboardEvents(): Promise<LeaderboardEvent[]> {
  const { data, error } = await supabase.from("event_leaderboards").select("*");
  if (error) {
    console.error("Error fetching leaderboards:", error);
    return [];
  }
  const byEvent = new Map<string, LeaderboardEvent>();
  ((data ?? []) as LeaderboardRow[]).forEach((row) => {
    const event = byEvent.get(row.event_id) ?? {
      eventId: row.event_id,
      eventCode: row.event_code,
      eventName: row.event_name,
      startDate: row.event_start_date,
      rows: [],
    };
    event.rows.push(row);
    byEvent.set(row.event_id, event);
  });
  return [...byEvent.values()].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}
