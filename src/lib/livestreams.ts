import { supabase } from "@/lib/supabase";
import { parseYouTubeLink, type YouTubeVideo } from "@/lib/youtube";

/**
 * Event livestreams that managers add for matches The Blue Alliance has no video of. Each
 * one is scanned by a GitHub Actions workflow (scripts/livestream_clips), which reads the
 * match name and clock off the broadcast overlay and saves where each match starts and ends.
 */
export interface EventLivestream {
  id: string;
  url: string;
  videoId: string;
  status: "queued" | "processing" | "done" | "failed";
  /** Why the scan failed, worded for the manager. */
  error: string | null;
  matchesFound: number | null;
  createdAt: string;
  /** When its status last changed. */
  updatedAt: string;
}

interface LivestreamRow {
  id: string;
  url: string;
  video_id: string;
  status: EventLivestream["status"];
  error: string | null;
  matches_found: number | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (row: LivestreamRow): EventLivestream => ({
  id: row.id,
  url: row.url,
  videoId: row.video_id,
  status: row.status,
  error: row.error,
  matchesFound: row.matches_found,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const isScanning = (livestream: EventLivestream) => livestream.status === "queued" || livestream.status === "processing";

/** GitHub starts a run within a minute or two; longer means the scan never started (it can be retried). */
const STUCK_QUEUED_MS = 10 * 60 * 1000;
export const isStuck = (livestream: EventLivestream) =>
  livestream.status === "queued" && Date.now() - new Date(livestream.updatedAt).getTime() > STUCK_QUEUED_MS;

export async function getEventLivestreams(eventId: string): Promise<EventLivestream[]> {
  const { data, error } = await supabase
    .from("event_livestreams")
    .select("id, url, video_id, status, error, matches_found, created_at, updated_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LivestreamRow[]).map(fromRow);
}

/** Starts (or restarts) the scan of a livestream that's already been added. */
export async function scanLivestream(livestreamId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("scan-livestream", { body: { livestreamId } });
  if (error || data?.error) {
    // The function's own message (in the response body) explains more than the HTTP error
    const message = data?.error ?? (await error?.context?.json?.().catch(() => null))?.error ?? error?.message;
    throw new Error(message || "Couldn't start the scan.");
  }
}

/** Adds an event livestream from a YouTube link and starts scanning it. */
export async function addEventLivestream(eventId: string, userId: string, link: string): Promise<void> {
  const video = parseYouTubeLink(link);
  if (!video) throw new Error("That isn't a YouTube video link.");
  const { data, error } = await supabase
    .from("event_livestreams")
    .insert({ event_id: eventId, url: `https://www.youtube.com/watch?v=${video.id}`, video_id: video.id, added_by: userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That livestream has already been added for this event.");
    throw new Error(error.code === "42501" ? "Only managers can add livestreams." : error.message);
  }
  await scanLivestream(data.id);
}

/** Removes a livestream and the match clips found in it. */
export async function removeEventLivestream(livestreamId: string): Promise<void> {
  const { error } = await supabase.from("event_livestreams").delete().eq("id", livestreamId);
  if (error) throw new Error(error.message);
}

/** A match's section of a livestream. */
export type MatchClip = YouTubeVideo & { end: number };

/**
 * The clips found in the event's livestreams, by TBA match key without the event ("qm68",
 * "sf5m1", "f1m2"). Empty when there are none, or before the livestream migration.
 */
export async function getEventMatchClips(eventId: string): Promise<Map<string, MatchClip>> {
  const { data, error } = await supabase
    .from("match_video_clips")
    .select("match_key, video_id, start_seconds, end_seconds")
    .eq("event_id", eventId);
  if (error) {
    console.warn("Could not load livestream match clips:", error);
    return new Map();
  }
  return new Map(
    (data ?? []).map((row) => [
      row.match_key as string,
      { id: row.video_id as string, start: row.start_seconds as number, end: row.end_seconds as number },
    ])
  );
}
